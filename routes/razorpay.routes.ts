import express from "express";
import {
  razorpayWebhook,
  createRazorpayOrder,
} from "../controllers/razorpay.controller.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";

const router = express.Router();

/**
 * Create Razorpay Order (Protected by jwtAuth)
 */
router.post("/create-order", jwtAuth, createRazorpayOrder);

/**
 * Razorpay Webhook
 * NOTE: Handled in app.ts with express.raw() for signature verification
 */
// router.post("/webhook", razorpayWebhook);

export default router;