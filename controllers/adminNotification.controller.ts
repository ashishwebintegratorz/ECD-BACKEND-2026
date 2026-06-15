import { Request, Response } from "express";
import admin from "../config/firebase.config.js";
import Device from "../models/Device.model.js";
import Notification from "../models/Notification.model.js";

export const sendNotificationToAllUsers = async (
    req: Request,
    res: Response
) => {
    try {
        const { title, message } = req.body;

        const devices = await Device.find({
            fcmToken: { $exists: true }
        });

        const tokens = devices.map(
            d => d.fcmToken
        );

        if (!tokens.length) {
            return res.status(400).json({
                message: "No devices found"
            });
        }

        const response =
            await admin.messaging()
                .sendEachForMulticast({
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
            type: "global"
        });

        res.json({
            success: true,
            sent: response.successCount
        });

    } catch (error) {
        console.log(error);

        res.status(500).json({
            success: false
        });
    }
};

export const getAdminNotificationHistory = async (req: Request, res: Response) => {
    try {
        const notifications = await Notification.find({ type: "global" })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({
            success: true,
            notifications
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false
        });
    }
};