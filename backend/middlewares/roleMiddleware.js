export const requireUser = (req, res, next) => {
  const role = req.user?.role;

  if (role === "user" || role === "admin") {
    return next();
  }

  return res.status(403).json({ message: "Forbidden: user role required." });
};

export const requireAdmin = (req, res, next) => {
  const role = req.user?.role;

  if (role === "admin") {
    return next();
  }

  return res.status(403).json({ message: "Forbidden: admin role required." });
};
