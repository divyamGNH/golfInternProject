import express from "express";
import paymentController from "../controllers/paymentController.js";

const router = express.Router();

router.post("/create-checkout-session",paymentController);

export default router;