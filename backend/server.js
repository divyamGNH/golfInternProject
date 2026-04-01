import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";

import connectDB from "./db/db.js";
import authRoutes from "./routes/userRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js"
import lotteryRoutes from "./routes/lotteryRoutes.js";

import authMiddleware from "./middlewares/authMiddleware.js";

dotenv.config();
connectDB();

const PORT = process.env.PORT || 3000;

const app = express();

app.use("/api/webhook",express.raw({ type: "application/json" }),webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use("/api/auth",authRoutes);
app.use("/api/payments",authMiddleware,paymentRoutes);
app.use("/api/lottery",authMiddleware,lotteryRoutes);
// app.use("/",isAuthorized,);

app.listen(PORT, () => {
    console.log(`Server listening on PORT:${PORT}`);
});
