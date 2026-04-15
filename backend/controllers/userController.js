import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db/client.js";

dotenv.config();

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const setAuthCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

//Register route
export const register = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ message: "username, email and password are required." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Provide a valid email address." });
  }

  if (String(password).length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters long." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if user already exists
    const existingUser = await query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [normalizedEmail],
    );

    if (existingUser.rowCount > 0) {
      return res
        .status(400)
        .json({ message: "User already registered. Please login instead." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const insertedUser = await query(
      `
        INSERT INTO users (username, email, password_hash, role)
        VALUES ($1, $2, $3, 'user')
        RETURNING id AS "_id", username, email, role
      `,
      [String(username).trim(), normalizedEmail, hashedPassword],
    );

    const newUser = insertedUser.rows[0];

    const token = jwt.sign(
      { userId: newUser._id, role: newUser.role, email: newUser.email },
      JWT_SECRET_KEY,
      { expiresIn: "7d" },
    );

    setAuthCookie(res, token);

    console.log("[auth] user-registered", {
      userId: newUser._id,
      email: newUser.email,
      role: newUser.role,
    });
    res.status(201).json({
      message: "User registered successfully.",
      user: {
        userId: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
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

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "email and password are required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    // Find user by email
    const userResult = await query(
      `
        SELECT
          id AS "_id",
          username,
          email,
          role,
          password_hash
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [normalizedEmail],
    );

    if (userResult.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "User not found. Please register first." });
    }

    const user = userResult.rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role, email: user.email },
      JWT_SECRET_KEY,
      { expiresIn: "7d" },
    );

    setAuthCookie(res, token);

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
    console.log("Error checking Auth : ", error);
    res.status(500).json({ message: "Error checking auth." });
  }
};

export const ensureTestAdmin = async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Not available in production." });
  }

  const email = String(process.env.TEST_ADMIN_EMAIL || "admin@eventreg.com")
    .trim()
    .toLowerCase();
  const password = String(process.env.TEST_ADMIN_PASSWORD || "admin12345");
  const username = String(
    process.env.TEST_ADMIN_USERNAME || "Test Admin",
  ).trim();

  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "TEST_ADMIN_PASSWORD must be at least 8 characters." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const userResult = await query(
      `
        SELECT id AS "_id", username, email, role
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email],
    );

    if (userResult.rowCount === 0) {
      await query(
        `
          INSERT INTO users (username, email, password_hash, role)
          VALUES ($1, $2, $3, 'admin')
        `,
        [username, email, hashedPassword],
      );
    } else {
      await query(
        `
          UPDATE users
          SET username = $1,
              password_hash = $2,
              role = 'admin'
          WHERE email = $3
        `,
        [username, hashedPassword, email],
      );
    }

    return res.status(200).json({
      message: "Test admin is ready.",
      testAdmin: {
        email,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to prepare test admin.", error: error.message });
  }
};
