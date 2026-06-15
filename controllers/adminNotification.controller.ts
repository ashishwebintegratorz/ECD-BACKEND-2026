import { Request, Response } from "express";
import admin from "../config/firebase.config.js";
import Device from "../models/Device.model.js";

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