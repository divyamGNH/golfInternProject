import { query } from "../db/client.js";
import { isValidUuid } from "../db/utils.js";

const resolveUserRole = async (userId) => {
  const result = await query(
    `
      SELECT role
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0]?.role || null;
};

export const requireUser = async (req, res, next) => {
  const userId = req.user?.userId;

  if (!isValidUuid(userId)) {
    return res.status(401).json({ message: "Invalid session. Please login again." });
  }

  try {
    const role = await resolveUserRole(userId);

    if (role === "user" || role === "admin") {
      req.user.role = role;
      return next();
    }

    return res.status(403).json({ message: "Forbidden: user role required." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify user role." });
  }
};

export const requireAdmin = async (req, res, next) => {
  const userId = req.user?.userId;

  if (!isValidUuid(userId)) {
    return res.status(401).json({ message: "Invalid session. Please login again." });
  }

  try {
    const role = await resolveUserRole(userId);

    if (role === "admin") {
      req.user.role = role;
      return next();
    }

    return res.status(403).json({ message: "Forbidden: admin role required." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify admin role." });
  }
};
