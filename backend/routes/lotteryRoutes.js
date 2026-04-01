import express from "express";
import {
	getScores,
	runWeightedLottery,
	submitScore,
} from "../controllers/lotteryController.js";

const router = express.Router();

router.get("/scores", getScores);
router.post("/submit-score", submitScore);
router.post("/draw-weighted", runWeightedLottery);

export default router;
