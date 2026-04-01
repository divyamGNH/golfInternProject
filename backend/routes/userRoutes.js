import express from "express";
import { register, login, logout, checkAuth } from "../controllers/userController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import { requireAdmin, requireUser } from "../middlewares/roleMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/check", authMiddleware, checkAuth);
router.get("/dashboard", authMiddleware, requireUser, (req, res) => {
	res.status(200).json({
		message: "Dashboard data: accessible by user and admin.",
		user: req.user,
	});
});
router.get("/admin", authMiddleware, requireAdmin, (req, res) => {
	res.status(200).json({
		message: "Admin data: accessible only by admin.",
		user: req.user,
	});
});

export default router;
