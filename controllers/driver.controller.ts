import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import UserModel from "../models/User.model.js";
import OrderModel from "../models/Order.model.js";

/**
 * Get all drivers with their busy status
 */
export const getAllDrivers = asyncHandler(async (req: Request, res: Response) => {
    const drivers = await UserModel.find({ role: "driver" }).select("name phone email avatar isOnline isReturning");

    const enhancedDrivers = await Promise.all(drivers.map(async (driver) => {
        const activeOrder = await OrderModel.findOne({
            assignedDriver: driver._id,
            deliveryStatus: { $in: ["assigned", "out_for_delivery"] }
        });
        return {
            ...driver.toObject(),
            isBusy: !!activeOrder || driver.isReturning
        };
    }));

    return res.json(enhancedDrivers);
});

/**
 * Get free drivers (Online and not busy)
 */
export const getFreeDrivers = asyncHandler(async (req: Request, res: Response) => {
    const onlineDrivers = await UserModel.find({ role: "driver", isOnline: true }).select("name phone email avatar isOnline isReturning");

    const freeDrivers = [];

    for (const driver of onlineDrivers) {
        const activeOrder = await OrderModel.findOne({
            assignedDriver: driver._id,
            deliveryStatus: { $in: ["assigned", "out_for_delivery"] }
        });

        if (!activeOrder && !driver.isReturning) {
            freeDrivers.push({
                ...driver.toObject(),
                isBusy: false
            });
        }
    }

    return res.json(freeDrivers);
});

/**
 * Toggle driver online/offline status
 */
export const toggleOnlineStatus = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { isOnline } = req.body;

    if (typeof isOnline !== "boolean") {
        return res.status(400).json({ message: "isOnline boolean is required" });
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
        user._id,
        { isOnline },
        { new: true }
    );

    return res.json({ message: `Status updated to ${isOnline ? "Online" : "Offline"}`, user: updatedUser });
});

/**
 * Mark driver as reached store (reset isReturning)
 */
export const markReachedStoreStatus = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;

    const updatedUser = await UserModel.findByIdAndUpdate(
        user._id,
        { isReturning: false },
        { new: true }
    );

    return res.json({ message: "Welcome back! You are now available for new orders.", user: updatedUser });
});
