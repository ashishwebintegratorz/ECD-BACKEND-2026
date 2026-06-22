import Refund from "../models/Refund.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import { razorpay } from "../config/razorpay.config.js";
import { notifyRefundCompleted } from "./notification.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Create a refund record when order is cancelled
// COD orders: marked completed immediately (no actual money to return)
// Razorpay orders: scheduled for processing within 24 hours
// ─────────────────────────────────────────────────────────────────────────────
export const createRefundRecord = async (
    orderId: string,
    orderNumber: string,
    customerId: string,
    amount: number,
    reason: string,
    initiatedBy: "customer" | "restaurant" | "admin",
    isPriority: boolean = false
) => {
    // Find the payment transaction to get payment method + Razorpay ID
    const transaction = await PaymentTransaction.findOne({
        order: orderId,
        status: "success",
    });

    if (!transaction) {
        console.warn(`[ECD KART Refund] No successful transaction found for order ${orderNumber}`);
        return null;
    }

    const isCod = transaction.provider === "cod";

    const refund = await Refund.create({
        order: orderId,
        orderNumber,
        customer: customerId,
        amount,
        reason,
        initiatedBy,
        paymentMethod: transaction.provider,
        razorpayPaymentId: transaction.providerPaymentId,
        status: isCod ? "completed" : "pending", 
        isPriority,
        scheduledAt: new Date(),                       
        processedAt: isCod ? new Date() : undefined,
    });

    console.log(`[ECD KART Refund] Created refund for ${orderNumber}: ₹${amount} via ${transaction.provider} — status: ${refund.status}`);
    return refund;
};

// ─────────────────────────────────────────────────────────────────────────────
// Process pending Razorpay refunds
// Called by cron job every hour
// ─────────────────────────────────────────────────────────────────────────────
export const processPendingRefunds = async () => {
    const pending = await Refund.find({
        status: "pending",
        paymentMethod: "razorpay",
        razorpayPaymentId: { $exists: true, $ne: null },
    });

    if (pending.length === 0) {
        console.log("[ECD KART Refund] No pending Razorpay refunds.");
        return;
    }

    console.log(`[ECD KART Refund] Processing ${pending.length} pending refunds...`);

    for (const refund of pending) {
        try {
            // Mark as processing
            refund.status = "processing";
            await refund.save();

            // Call Razorpay refund API (Instant Refund)
            const razorpayRefund = await (razorpay.payments as any).refund(
                refund.razorpayPaymentId!,
                { 
                    amount: refund.amount * 100, // Razorpay uses paise
                    speed: "optimum" // Enables Instant Refund
                } 
            );

            refund.status = "completed";
            refund.razorpayRefundId = razorpayRefund.id;
            refund.processedAt = new Date();
            await refund.save();

            // Mark original transaction as refunded
            await PaymentTransaction.findOneAndUpdate(
                { providerPaymentId: refund.razorpayPaymentId },
                { status: "refunded" }
            );

            // Push: notify customer refund completed
            notifyRefundCompleted(refund.customer.toString(), refund.amount, refund.orderNumber).catch(() => { });

            console.log(`[ECD KART Refund] ✅ Refund completed for ${refund.orderNumber}: ₹${refund.amount} — Razorpay ID: ${razorpayRefund.id}`);
        } catch (err: any) {
            refund.status = "failed";
            refund.failureReason = err?.message ?? "Unknown error";
            await refund.save();
            console.error(`[ECD KART Refund] ❌ Refund failed for ${refund.orderNumber}:`, err?.message);
        }
    }
};
