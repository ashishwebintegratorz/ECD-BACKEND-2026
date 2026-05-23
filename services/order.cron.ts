import cron from "node-cron";
import Order from "../models/Order.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import { createRefundRecord } from "./refund.service.js";
import { notifyOrderCancelled, notifyRefundInitiated } from "./notification.service.js";
import { emitOrderStatusUpdate } from "../socket/orderSocket.js";

const autoCancelOrders = async () => {
    // console.log(`[Cron] Checking for expired orders...`);
    
    try {
        const now = new Date();
        const threeMinsAgo = new Date(now.getTime() - 3 * 60 * 1000);
        const fourMinsAgo = new Date(now.getTime() - 4 * 60 * 1000);

        // 1. Pending orders > 3 minutes (Restaurant didn't accept)
        const expiredPendingOrders = await Order.find({
            status: "pending",
            createdAt: { $lt: threeMinsAgo }
        });

        for (const order of expiredPendingOrders) {
            console.log(`[Cron] Auto-cancelling pending order ${order.orderNumber} (Timeout 3m)`);
            const reason = "Auto-cancelled: Restaurant did not accept within 3 minutes.";
            
            order.status = "cancelled";
            order.cancelledBy = "admin";
            order.cancellationReason = reason;
            order.cancellationLog.push({
                cancelledBy: "admin" as any,
                cancelledByUser: order.customer,
                reason,
                cancelledAt: new Date()
            });
            await order.save();

            await PaymentTransaction.updateMany({ order: order._id }, { status: "failed" });
            
            await createRefundRecord(
                order._id.toString(),
                order.orderNumber,
                order.customer.toString(),
                order.payableAmount,
                reason,
                "admin" as any,
                true // Priority refund
            );

            notifyOrderCancelled(order.customer.toString(), order.orderNumber, reason).catch(() => {});
            notifyRefundInitiated(order.customer.toString(), order.payableAmount, order.orderNumber).catch(() => {});
            emitOrderStatusUpdate(order._id.toString(), {
                status: order.status,
                deliveryStatus: order.deliveryStatus,
                message: reason,
                updatedAt: (order as any).updatedAt,
            });
        }

        // 2. Ready orders > 4 minutes (No rider found)
        const expiredReadyOrders = await Order.find({
            status: "ready",
            deliveryStatus: { $nin: ["accepted", "assigned", "reached_store", "picked_up", "out_for_delivery", "delivered"] },
            readyAt: { $lt: fourMinsAgo }
        });

        for (const order of expiredReadyOrders) {
            console.log(`[Cron] Auto-cancelling ready order ${order.orderNumber} (Timeout 4m - No Riders)`);
            const reason = "Auto-cancelled: No riders available to deliver the order.";
            
            order.status = "cancelled";
            order.deliveryStatus = "failed";
            order.cancelledBy = "admin";
            order.cancellationReason = reason;
            order.cancellationLog.push({
                cancelledBy: "admin" as any,
                cancelledByUser: order.customer,
                reason,
                cancelledAt: new Date()
            });
            await order.save();

            await PaymentTransaction.updateMany({ order: order._id }, { status: "failed" });
            
            await createRefundRecord(
                order._id.toString(),
                order.orderNumber,
                order.customer.toString(),
                order.payableAmount,
                reason,
                "admin" as any,
                true
            );

            notifyOrderCancelled(order.customer.toString(), order.orderNumber, reason).catch(() => {});
            notifyRefundInitiated(order.customer.toString(), order.payableAmount, order.orderNumber).catch(() => {});
            emitOrderStatusUpdate(order._id.toString(), {
                status: order.status,
                deliveryStatus: order.deliveryStatus,
                message: reason,
                updatedAt: (order as any).updatedAt,
            });
        }

    } catch (err) {
        console.error(`[Cron] Auto-cancel orders failed:`, err);
    }
};

export const registerOrderCrons = () => {
    // Run every minute
    cron.schedule("* * * * *", autoCancelOrders, {
        timezone: "Asia/Kolkata",
    });

    console.log("[ECD KART Cron] Order auto-cancel cron registered → Every minute");
};
