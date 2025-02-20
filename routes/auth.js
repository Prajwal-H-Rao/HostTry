const express = require("express");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User.js");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

//This route is for registering new users

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  console.log(name, email, password);
  try {
    const existinUser = await User.findOne({ email });
    if (existinUser)
      return res.status(400).json({ message: "The user already exists" });

    const newUser = new User({ name, email, password });
    await newUser.save();

    res.status(200).json({ message: "The user registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

//This route is for Logging in the user

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    // console.log(user);
    if (!user) return res.status(404).json({ message: "The user not found" });
    // console.log(user.password);
    const isMatch = await bcryptjs.compare(password, user.password);
    // console.log(isMatch);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials" });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });
    // console.log(token);
    res
      .status(200)
      .json({
        token,
        email: user.email,
        name: user.name,
        message: "logged in",
      });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
