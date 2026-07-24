import Razorpay from "razorpay";
import { config } from "./app.config.js";

if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
  console.warn("⚠️ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing from environment variables!");
}

export const razorpay = new Razorpay({
  key_id: config.RAZORPAY_KEY_ID,
  key_secret: config.RAZORPAY_KEY_SECRET,
});

