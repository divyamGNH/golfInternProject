import jwt from "jsonwebtoken";

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const authMiddleware = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "No token. Not authorized." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET_KEY);
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      email: decoded.email,
    };
    next();
  } catch (error) {
    console.log("JWT verification error:", error);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

export default authMiddleware;
