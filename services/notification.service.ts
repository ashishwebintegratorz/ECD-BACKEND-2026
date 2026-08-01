import admin from "../config/firebase.config.js";
import Device from "../models/Device.model.js";
import Notification from "../models/Notification.model.js";
import NotificationQueue from "../models/NotificationQueue.model.js";

export type NotificationType =
    | "order_placed"
    | "order_preparing"
    | "order_ready"
    | "driver_assigned"
    | "driver_accepted"
    | "out_for_delivery"
    | "order_delivered"
    | "order_cancelled"
    | "refund_initiated"
    | "refund_completed"
    | "new_order_store"
    | "restaurant_payout";    // sent to restaurant app

interface SendOptions {
    userId: string;
    title: string;
    body: string;
    type: NotificationType;
    data?: Record<string, string>; // FCM data payload (strings only)
}

// ─────────────────────────────────────────────────────────────────────────────
// Send push notification to a single user
// Fetches all FCM tokens for the user, sends multicast, removes stale tokens
// Also saves a record in the Notification collection
// ─────────────────────────────────────────────────────────────────────────────
export const sendPushToUser = async (opts: SendOptions): Promise<void> => {
    const { userId, title, body, type, data = {} } = opts;

    // Save notification record regardless of push success
    await Notification.create({
        user: userId,
        title,
        body,
        type,
        data,
        read: false,
    });

    // Queue the push notification for processing by the background worker
    try {
        await NotificationQueue.create({
            userId,
            title,
            body,
            type,
            data,
            status: "pending",
            retryCount: 0,
            nextRetryAt: new Date(),
        });
    } catch (err) {
        console.error(`[ECD KART Queue] Failed to queue notification for user ${userId}:`, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrappers for each order event
// ─────────────────────────────────────────────────────────────────────────────

export const notifyOrderPlaced = (customerId: string, orderNumber: string) =>
    sendPushToUser({
        userId: customerId,
        title: "Order Placed ✅",
        body: `Your order ${orderNumber} has been placed and is being prepared.`,
        type: "order_placed",
        data: { orderNumber },
    });

export const notifyOrderPreparing = (customerId: string, orderNumber: string) =>
    sendPushToUser({
        userId: customerId,
        title: "Order Being Prepared 🍳",
        body: `${orderNumber} is being prepared by the store.`,
        type: "order_preparing",
        data: { orderNumber },
    });

export const notifyOrderReady = (customerId: string, orderNumber: string) =>
    sendPushToUser({
        userId: customerId,
        title: "Order Ready 📦",
        body: `${orderNumber} is ready! A rider will be assigned shortly.`,
        type: "order_ready",
        data: { orderNumber },
    });

export const notifyDriverAssigned = (driverId: string, orderNumber: string, orderId: string) =>
    sendPushToUser({
        userId: driverId,
        title: "New Delivery 🛵",
        body: `You have been assigned order ${orderNumber}. Accept or decline.`,
        type: "driver_assigned",
        data: { orderNumber, orderId },
    });

export const notifyDriverAccepted = (customerId: string, orderNumber: string) =>
    sendPushToUser({
        userId: customerId,
        title: "Rider On The Way 🛵",
        body: `Your rider has accepted order ${orderNumber} and is heading to the store.`,
        type: "driver_accepted",
        data: { orderNumber },
    });

export const notifyOutForDelivery = (customerId: string, orderNumber: string) =>
    sendPushToUser({
        userId: customerId,
        title: "Out for Delivery 🚀",
        body: `${orderNumber} is on the way to you!`,
        type: "out_for_delivery",
        data: { orderNumber },
    });

export const notifyOrderDelivered = (customerId: string, orderNumber: string) =>
    sendPushToUser({
        userId: customerId,
        title: "Order Delivered 🎉",
        body: `${orderNumber} has been delivered. Enjoy!`,
        type: "order_delivered",
        data: { orderNumber },
    });

export const notifyOrderCancelled = (customerId: string, orderNumber: string, reason?: string) =>
    sendPushToUser({
        userId: customerId,
        title: "Order Cancelled ❌",
        body: reason
            ? `${orderNumber} was cancelled: ${reason}`
            : `${orderNumber} has been cancelled.`,
        type: "order_cancelled",
        data: { orderNumber },
    });

export const notifyRefundInitiated = (customerId: string, amount: number, orderNumber: string) =>
    sendPushToUser({
        userId: customerId,
        title: "Refund Initiated 💰",
        body: `Refund of ₹${amount} for ${orderNumber} has been initiated and will be processed within 24 hours.`,
        type: "refund_initiated",
        data: { orderNumber, amount: String(amount) },
    });

export const notifyRefundCompleted = (customerId: string, amount: number, orderNumber: string) =>
    sendPushToUser({
        userId: customerId,
        title: "Refund Completed ✅",
        body: `₹${amount} refund for ${orderNumber} has been processed successfully.`,
        type: "refund_completed",
        data: { orderNumber, amount: String(amount) },
    });

export const notifyNewOrderToStore = (storeUserId: string, orderNumber: string, totalAmount: number) =>
    sendPushToUser({
        userId: storeUserId,
        title: "New Order Received 🔔",
        body: `Order ${orderNumber} — ₹${totalAmount}. Start preparing now!`,
        type: "new_order_store",
        data: { orderNumber, totalAmount: String(totalAmount) },
    });

export const notifyRestaurantPayout = (storeUserId: string, amount: number) =>
    sendPushToUser({
        userId: storeUserId,
        title: "Payout Completed ✅",
        body: `A payout of ₹${amount} has been processed successfully to your account.`,
        type: "restaurant_payout",
        data: { amount: String(amount) },
    });
