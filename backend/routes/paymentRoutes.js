import express from "express";
import {
  createCheckoutSession,
  getCheckoutQueueStatus,
  getCheckoutStatus,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post("/events/:eventId/checkout", createCheckoutSession);
router.get("/checkout-status/:sessionId", getCheckoutStatus);
router.get("/queue-status", getCheckoutQueueStatus);

export default router;
