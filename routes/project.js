const express = require("express");
const { body, validationResult } = require("express-validator");
const Project = require("../models/Project");
const Comment = require("../models/Comment");
const auth = require("../middleware/auth");

const router = express.Router();

// Create project
router.post(
  "/",
  auth,
  [
    body("title")
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Title is required and must be under 100 characters"),
    body("description")
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage("Description is required and must be under 1000 characters"),
    body("image").isURL({}).withMessage("Please enter a valid image URL"),
    body("githubUrl").isURL().withMessage("Please enter a valid GitHub URL"),
    body("liveUrl")
      .optional()
      .isURL({
        protocols: ["http", "https"],
        require_tld: false, // ← allow bare IPs
        require_protocol: true, // ← still require “http://” or “https://”
      })
      .withMessage("Please enter a valid live URL"),
  ],
  async (req, res) => {
    try {
      console.log(req.body);
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, description, image, githubUrl, liveUrl, tags } = req.body;

      const project = new Project({
        title,
        description,
        image,
        githubUrl,
        liveUrl,
        tags: tags ? tags.split(",").map((tag) => tag.trim()) : [],
        author: req.user._id,
      });

      await project.save();
      await project.populate("author", "username avatar");

      res.status(201).json(project);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get all projects with pagination
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const projects = await Project.find()
      .populate("author", "username avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Project.countDocuments();

    res.json({
      projects,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get project by ID
router.get("/:id", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate(
      "author",
      "username avatar bio githubProfile portfolio"
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update project
router.put("/:id", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check if user is the author
    if (project.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updateData = { ...req.body };

    if (updateData.tags && typeof updateData.tags === "string") {
      updateData.tags = updateData.tags.split(",").map((tag) => tag.trim());
    }

    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("author", "username avatar");

    res.json(updatedProject);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete project
router.delete("/:id", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check if user is the author
    if (project.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Delete all comments for this project
    await Comment.deleteMany({ project: req.params.id });

    // Delete the project
    await Project.findByIdAndDelete(req.params.id);

    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Like/Unlike project
router.post("/:id/like", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const userLiked = project.likes.includes(req.user._id);

    if (userLiked) {
      // Unlike
      project.likes = project.likes.filter(
        (id) => id.toString() !== req.user._id.toString()
      );
    } else {
      // Like
      project.likes.push(req.user._id);
    }

    await project.save();

    res.json({
      liked: !userLiked,
      likesCount: project.likesCount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's projects
router.get("/user/:userId", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const projects = await Project.find({ author: req.params.userId })
      .populate("author", "username avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Project.countDocuments({ author: req.params.userId });

    res.json({
      projects,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
