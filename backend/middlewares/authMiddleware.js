import jwt from "jsonwebtoken";
import { query } from "../db/client.js";
import { isValidUuid } from "../db/utils.js";

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const clearAuthCookie = (res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  });
};

const authMiddleware = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "No token. Not authorized." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET_KEY);

    if (!isValidUuid(decoded?.userId)) {
      clearAuthCookie(res);
      return res.status(401).json({ message: "Invalid session. Please login again." });
    }

    const userResult = await query(
      `
        SELECT id, username, email, role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [decoded.userId],
    );

    if (userResult.rowCount === 0) {
      clearAuthCookie(res);
      return res.status(401).json({ message: "Session user not found. Please login again." });
    }

    const user = userResult.rows[0];
    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
    };
    next();
  } catch (error) {
    console.log("JWT verification error:", error);
    clearAuthCookie(res);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

export default authMiddleware;
