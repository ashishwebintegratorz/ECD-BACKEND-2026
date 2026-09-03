import { Request, Response } from "express";
import admin from "../config/firebase.config.js";
import Device from "../models/Device.model.js";
import Notification from "../models/Notification.model.js";
import { NotFoundException } from "../utils/appError.js";

/**
 * Send push notification to all devices (Push broadcast)
 */
export const sendNotificationToAllUsers = async (
    req: Request,
    res: Response
) => {
    try {
        const { title, message } = req.body;

        const devices = await Device.find({
            fcmToken: { $exists: true }
        });

        const tokens = devices.map(d => d.fcmToken);

        if (!tokens.length) {
            return res.status(400).json({
                success: false,
                message: "No devices found"
            });
        }

        const response = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: {
                title,
                body: message
            }
        });

        // Save to database as a global notification history entry
        await Notification.create({
            title,
            body: message,
            type: "global",
            forAdmin: false,
        });

        res.json({
            success: true,
            sent: response.successCount
        });

    } catch (error: any) {
        console.error("sendNotificationToAllUsers error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get push broadcast history (global broadcasts)
 */
export const getAdminNotificationHistory = async (req: Request, res: Response) => {
    try {
        const notifications = await Notification.find({ type: "global" })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({
            success: true,
            notifications
        });
    } catch (error: any) {
        console.error("getAdminNotificationHistory error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get all real-time admin notifications with filtering and unread count
 */
export const getAdminNotifications = async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 30));
        const category = req.query.category as string;
        const isRead = req.query.isRead as string;

        const query: any = {
            $or: [
                { forAdmin: true },
                { type: "admin" }
            ]
        };

        if (category && category !== "all") {
            query.type = category;
        }

        if (isRead !== undefined && isRead !== "") {
            query.read = isRead === "true";
        }

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Notification.countDocuments(query),
            Notification.countDocuments({
                $or: [{ forAdmin: true }, { type: "admin" }],
                read: false
            })
        ]);

        res.json({
            success: true,
            notifications,
            total,
            unreadCount,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error: any) {
        console.error("getAdminNotifications error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Mark a single admin notification as read
 */
export const markAdminNotificationAsRead = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findByIdAndUpdate(
            id,
            { read: true },
            { new: true }
        );

        if (!notification) {
            throw new NotFoundException("Notification not found");
        }

        const unreadCount = await Notification.countDocuments({
            $or: [{ forAdmin: true }, { type: "admin" }],
            read: false
        });

        res.json({
            success: true,
            notification,
            unreadCount
        });
    } catch (error: any) {
        console.error("markAdminNotificationAsRead error:", error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Mark all admin notifications as read
 */
export const markAllAdminNotificationsAsRead = async (_req: Request, res: Response) => {
    try {
        await Notification.updateMany(
            { $or: [{ forAdmin: true }, { type: "admin" }], read: false },
            { read: true }
        );

        res.json({
            success: true,
            message: "All admin notifications marked as read",
            unreadCount: 0
        });
    } catch (error: any) {
        console.error("markAllAdminNotificationsAsRead error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Delete a single admin notification
 */
export const deleteAdminNotification = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndDelete(id);

        const unreadCount = await Notification.countDocuments({
            $or: [{ forAdmin: true }, { type: "admin" }],
            read: false
        });

        res.json({
            success: true,
            message: "Notification deleted",
            unreadCount
        });
    } catch (error: any) {
        console.error("deleteAdminNotification error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Clear/delete all admin notifications
 */
export const clearAllAdminNotifications = async (_req: Request, res: Response) => {
    try {
        await Notification.deleteMany({
            $or: [{ forAdmin: true }, { type: "admin" }]
        });

        res.json({
            success: true,
            message: "All admin notifications cleared",
            unreadCount: 0
        });
    } catch (error: any) {
        console.error("clearAllAdminNotifications error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};