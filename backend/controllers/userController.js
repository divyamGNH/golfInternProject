import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

dotenv.config();

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

//Register route
export const register = async (req, res) => {
  const { username, email, password } = req.body;
  console.log(req.body);

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already registered. Please login instead." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: "user",
    });
    await newUser.save();

    console.log("User registered Succesfully");
    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.log("error registering", error);
    res
      .status(500)
      .json({ message: "Error registering user.", error: error.message });
  }
};

//Login Routes
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found. Please register first." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role, email: user.email },
      JWT_SECRET_KEY,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // true in production (HTTPS)
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7days expiry
    });

    console.log("Logged in succesfully");
    res.status(200).json({
      message: "Login successful.",
      user: {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.log("Error in logging in", error);
    res
      .status(500)
      .json({ message: "Error logging in.", error: error.message });
  }
};

//Logout Route
export const logout = (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: false, // set true if using HTTPS in production
    });
    res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    console.log("Error in logging out", error);
    res
      .status(500)
      .json({ message: "Error logging out.", error: error.message });
  }
};

export const checkAuth = (req, res) => {
  try {
    res.status(200).json({ user: req.user });
  } catch (error) {
    console.log("Error checking Auth : ",error);
  }
};
