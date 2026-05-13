import express from "express";
import {
  razorpayWebhook,
  createRazorpayOrder,
} from "../controllers/razorpay.controller.js";

const router = express.Router();

/**
 * Create Razorpay Order
 */
router.post("/create-order", createRazorpayOrder);

/**
 * Razorpay Webhook
 * NOTE: Handled in app.ts with express.raw() for signature verification
 */
// router.post("/webhook", razorpayWebhook);

export default router;