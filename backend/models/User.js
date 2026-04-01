import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },

  password: {
    type: String,
    required: true,
  },

  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },

  subscription: {
    status: {
      type: String,
      enum: ["active", "inactive", "cancelled"],
      default: "inactive",
    },

    plan: {
      type: String,
      enum: ["monthly", "yearly"],
    },

    stripeCustomerId: String,
    stripeSubscriptionId: String,

    currentPeriodEnd: Date,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("User", userSchema);