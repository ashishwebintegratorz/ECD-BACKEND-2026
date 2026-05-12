import express from "express";

import {

  razorpayWebhook,

  createRazorpayOrder,

} from "../controllers/razorpay.controller.js";

const router = express.Router();

/**
 * Create Razorpay Order
 */

router.post(

  "/create-order",

  createRazorpayOrder

);

/**
 * Razorpay Webhook
 * ⚠️ DO NOT add auth middleware
 * ⚠️ Must use express.raw()
 */

router.post(

  "/webhook",

  express.raw({

    type: "application/json",

  }),

  razorpayWebhook

);

export default router;