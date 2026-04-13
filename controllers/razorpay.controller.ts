import PaymentTransaction from "../models/PaymentTransaction.model.js";
import { Request, Response } from "express";
import crypto from "crypto";
import { confirmOrderLogic } from "../services/order.service.js";

export const razorpayWebhook = async (req: Request, res: Response) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    const razorpaySignature = req.headers["x-razorpay-signature"] as string;

    // 1️⃣ Verify signature (RAW BODY ONLY)
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body) // 👈 RAW BUFFER
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).send("Invalid signature");
    }

    // 2️⃣ Parse payload AFTER verification
    const payload = JSON.parse(req.body.toString());
    const event = payload.event;

    const payment = payload?.payload?.payment?.entity;
    if (!payment?.order_id) {
      // Some events don’t include payment object
      return res.json({ received: true });
    }

    const razorpayOrderId = payment.order_id;

    // 3️⃣ Handle payment failed
    if (event === "payment.failed") {
      await PaymentTransaction.findOneAndUpdate(
        { providerPaymentId: razorpayOrderId },
        { status: "failed" }
      );

      return res.json({ received: true });
    }

    // 4️⃣ Handle payment success (IDEMPOTENT)
    if (event === "payment.captured") {
      const txn = await PaymentTransaction.findOne({
        providerPaymentId: razorpayOrderId,
      });

      if (!txn) {
        return res.json({ received: true });
      }

      // Prevent duplicate processing
      if (txn.status === "success") {
        return res.json({ received: true });
      }

      txn.status = "success";
      txn.meta = {
        razorpay_payment_id: payment.id,
        method: payment.method,
      };

      await txn.save();

      // MUST be idempotent internally
      await confirmOrderLogic(txn.order.toString());
    }

    // 5️⃣ Acknowledge Razorpay
    res.json({ received: true });
  } catch (error) {
    console.error("Razorpay webhook error:", error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
};
