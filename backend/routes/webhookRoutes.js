import express from "express";
import webhookController from "../controllers/webhookController.js";

const router = express.Router();

router.post("/", webhookController);

export default router;
