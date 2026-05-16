import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import UserModel from "../models/User.model.js";
import OrderModel from "../models/Order.model.js";
import DriverLocation from "../models/DriverLocation.model.js";
import { emitDriverLocation } from "../socket/orderSocket.js";

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

/**
 * Driver: Update live GPS location
 * Called by driver app every 10-15 seconds while on delivery
 */
export const updateDriverLocation = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user._id.toString();
    const { lat, lng, speed, heading } = req.body;

    if (lat === undefined || lng === undefined)
        return res.status(400).json({ message: "lat and lng are required" });

    // Upsert — one location doc per driver
    await DriverLocation.findOneAndUpdate(
        { driver: driverId },
        {
            driver: driverId,
            location: { type: "Point", coordinates: [Number(lng), Number(lat)] },
            speed: speed ? Number(speed) : undefined,
            heading: heading ? Number(heading) : undefined,
        },
        { upsert: true, new: true }
    );

    // Emit to admin room in real-time
    emitDriverLocation(driverId, { lat: Number(lat), lng: Number(lng), speed, heading });

    return res.json({ message: "Location updated" });
});

/**
 * Admin: Get all driver locations
 */
export const getAllDriverLocations = asyncHandler(async (_req: Request, res: Response) => {
    const locations = await DriverLocation.find()
        .populate("driver", "name phone isOnline isReturning")
        .sort({ updatedAt: -1 });

    return res.json({ locations });
});

/**
 * Driver: Get current profile details
 */
export const getDriverProfile = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const driver = await UserModel.findById(user._id).select("-pinHash");
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    return res.json(driver);
});

/**
 * Driver: Update profile / documents
 * Handles multipart form data for document uploads
 */
export const updateDriverProfile = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { name, email } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;

    // Handle document paths (in a real app, these would be S3/Cloudinary URLs)
    // For now, we'll store mock paths based on originalname
    if (files) {
        if (!updateData.documents) updateData.documents = {};
        
        const docMapping: any = {
            aadhar_front: "aadharFront",
            aadhar_back: "aadharBack",
            pan_card: "panCard",
            license: "license",
            vehicle_rc: "vehicleRc",
            bank_passbook: "bankPassbook"
        };

        for (const [field, filename] of Object.entries(docMapping)) {
            if (files[field]) {
                updateData.documents[filename as string] = `uploads/${files[field][0].originalname}`;
            }
        }
        
        if (files["profile_image"]) {
            updateData.avatar = `uploads/${files["profile_image"][0].originalname}`;
        }
    }

    const updatedDriver = await UserModel.findByIdAndUpdate(
        user._id,
        { $set: updateData },
        { new: true }
    ).select("-pinHash");


    return res.json({ message: "Profile updated successfully", user: updatedDriver });
});

/**
 * Driver: Logout and mark as offline
 */
export const logoutDriver = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    
    await UserModel.findByIdAndUpdate(user._id, {
        isOnline: false,
        isReturning: false
    });

    return res.json({ message: "Logged out successfully" });
});
