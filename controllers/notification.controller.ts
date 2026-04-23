import { Request, Response } from "express";
import Device from "../models/Device.model.js";
import Notification from "../models/Notification.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// Register or update FCM device token
// Called by frontend after login or when token refreshes
// ─────────────────────────────────────────────────────────────────────────────
export const registerDevice = async (req: Request, res: Response) => {
    const userId = req.user.id;
    const { fcmToken, platform, deviceId, deviceInfo } = req.body;

    if (!fcmToken) return res.status(400).json({ message: "fcmToken is required" });
    if (!platform) return res.status(400).json({ message: "platform is required (android|ios|web)" });

    // Upsert — update if token exists, create if not
    await Device.findOneAndUpdate(
        { user: userId, fcmToken },
        { user: userId, fcmToken, platform, deviceId, deviceInfo, lastSeenAt: new Date() },
        { upsert: true, new: true }
    );

    return res.json({ message: "Device registered successfully" });
};

// ─────────────────────────────────────────────────────────────────────────────
// Remove FCM token (on logout)
// ─────────────────────────────────────────────────────────────────────────────
export const removeDevice = async (req: Request, res: Response) => {
    const userId = req.user.id;
    const { fcmToken } = req.body;

    if (!fcmToken) return res.status(400).json({ message: "fcmToken is required" });

    await Device.findOneAndDelete({ user: userId, fcmToken });

    return res.json({ message: "Device removed" });
};

// ─────────────────────────────────────────────────────────────────────────────
// Get my notifications (paginated)
// ─────────────────────────────────────────────────────────────────────────────
export const getMyNotifications = async (req: Request, res: Response) => {
    const userId = req.user.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);

    const [notifications, total, unreadCount] = await Promise.all([
        Notification.find({ user: userId })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Notification.countDocuments({ user: userId }),
        Notification.countDocuments({ user: userId, read: false }),
    ]);

    return res.json({ notifications, total, unreadCount, page, limit });
};

// ─────────────────────────────────────────────────────────────────────────────
// Mark notification as read
// ─────────────────────────────────────────────────────────────────────────────
export const markAsRead = async (req: Request, res: Response) => {
    const userId = req.user.id;
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
        { _id: id, user: userId },
        { read: true },
        { new: true }
    );

    if (!notification) return res.status(404).json({ message: "Notification not found" });

    return res.json({ message: "Marked as read", notification });
};

// ─────────────────────────────────────────────────────────────────────────────
// Mark all notifications as read
// ─────────────────────────────────────────────────────────────────────────────
export const markAllAsRead = async (req: Request, res: Response) => {
    const userId = req.user.id;
    await Notification.updateMany({ user: userId, read: false }, { read: true });
    return res.json({ message: "All notifications marked as read" });
};

// ─────────────────────────────────────────────────────────────────────────────
// Get unread count
// ─────────────────────────────────────────────────────────────────────────────
export const getUnreadCount = async (req: Request, res: Response) => {
    const count = await Notification.countDocuments({ user: req.user.id, read: false });
    return res.json({ unreadCount: count });
};
