import express from "express";
import { razorpayWebhook } from "../controllers/razorpay.controller.js";

const router = express.Router();

/**
 * Razorpay webhook endpoint
 * ⚠️ DO NOT add auth middleware here
 * ⚠️ Must use express.raw()
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  razorpayWebhook
);

export default router;
