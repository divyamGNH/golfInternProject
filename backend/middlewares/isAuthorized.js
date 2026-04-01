import jwt from "jsonwebtoken";

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const isAuthorized = (req, res, next) => {
  const token = req.cookies.token; // fixed from req.cookie

  if (!token) {
    return res.status(401).json({ message: "No token. Not authorized." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET_KEY);

    //Send the whole user to the next function after this middleware
    req.user = decoded;
    next();
  } catch (error) {
    console.log("JWT verification error:", error);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

export default isAuthorized;
