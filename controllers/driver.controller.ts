import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import UserModel from "../models/User.model.js";
import OrderModel from "../models/Order.model.js";
import DriverLocation from "../models/DriverLocation.model.js";
import { emitDriverLocation, emitDriverStatusUpdate } from "../socket/orderSocket.js";
import { uploadToImageKit } from "../services/imagekit.service.js";

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

import DeliveryZone from "../models/DeliveryZone.model.js";

// Helper: Haversine distance in km
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Toggle driver online/offline status
 */
export const toggleOnlineStatus = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { isOnline, latitude, longitude, lat, lng } = req.body;

    if (typeof isOnline !== "boolean") {
        return res.status(400).json({ success: false, message: "isOnline boolean is required" });
    }

    // If driver is attempting to go online, verify if location is inside active Delivery Zone
    if (isOnline) {
        let checkLat = lat !== undefined ? Number(lat) : (latitude !== undefined ? Number(latitude) : undefined);
        let checkLng = lng !== undefined ? Number(lng) : (longitude !== undefined ? Number(longitude) : undefined);

        if (checkLat === undefined || checkLng === undefined) {
            const lastLoc = await DriverLocation.findOne({ driver: user._id });
            if (lastLoc && lastLoc.location?.coordinates?.length >= 2) {
                checkLng = lastLoc.location.coordinates[0];
                checkLat = lastLoc.location.coordinates[1];
            }
        }

        if (checkLat !== undefined && checkLng !== undefined && !isNaN(checkLat) && !isNaN(checkLng)) {
            const activeZones = await DeliveryZone.find({ isActive: true }).lean();
            if (activeZones.length > 0) {
                let inZone = false;
                for (const zone of activeZones) {
                    const center = zone.center || { lat: 28.4595, lng: 77.0266 };
                    const radiusKm = zone.radiusKm || 15;
                    const dist = calculateDistanceKm(checkLat, checkLng, center.lat, center.lng);
                    if (dist <= radiusKm) {
                        inZone = true;
                        break;
                    }
                }

                if (!inZone) {
                    const activeCities = activeZones.map((z: any) => z.name || z.state || z.city);
                    return res.status(403).json({
                        success: false,
                        inZone: false,
                        message: `You are outside active delivery zones. We currently operate in: ${activeCities.join(", ")}. Please move into an active delivery zone to go online and accept delivery orders.`,
                        activeCities,
                    });
                }
            }
        }
    }

    const updateObj: any = { isOnline };
    if (isOnline) {
        updateObj.isReturning = false; // Reset returning status when going online
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
        user._id,
        updateObj,
        { new: true }
    );

    emitDriverStatusUpdate(user._id.toString(), isOnline, { user: updatedUser });

    return res.json({ success: true, message: `Status updated to ${isOnline ? "Online" : "Offline"}`, user: updatedUser });
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

    // Check delivery zone in real-time
    const activeZones = await DeliveryZone.find({ isActive: true }).lean();
    let inZone = true;
    let activeCities: string[] = [];
    if (activeZones.length > 0) {
        inZone = false;
        activeCities = activeZones.map((z: any) => z.name || z.state || z.city);
        for (const zone of activeZones) {
            const center = zone.center || { lat: 28.4595, lng: 77.0266 };
            const radiusKm = zone.radiusKm || 15;
            const dist = calculateDistanceKm(Number(lat), Number(lng), center.lat, center.lng);
            if (dist <= radiusKm) {
                inZone = true;
                break;
            }
        }
    }

    return res.json({ 
        success: true, 
        message: "Location updated",
        inZone,
        activeCities,
    });
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

    return res.json({ user: driver });
});

/**
 * Driver: Update profile / documents
 * Handles multipart form data for document uploads
 */
export const updateDriverProfile = asyncHandler(async (req: Request, res: Response) => {
    // User requested debug logs
    console.log("REQ FILES:", req.files);
    console.log("REQ FILE:", req.file);
    if (req.files) {
        console.log("FIRST FILE:", (req.files as any)[0]);
    }

    let user = (req as any).user;
    const { name, email, upi, pin } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    let isNewUser = false;
    if (user.onboarding) {
        const dbUser = new UserModel({
            phone: user.phone || req.body.phone,
            role: "driver",
            isVerified: true,
            name: name || ""
        });
        await dbUser.save();
        user._id = dbUser._id;
        isNewUser = true;
    } else {
        const dbUser = await UserModel.findById(user._id);
        if (!dbUser) {
            return res.status(404).json({ success: false, message: "Driver not found in database." });
        }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (upi) updateData.upi = upi;
    if (pin) {
        const bcrypt = await import("bcrypt");
        const salt = await bcrypt.genSalt(10);
        updateData.pinHash = await bcrypt.hash(pin, salt);
    }

    if (files) {
        if (!updateData.documents) updateData.documents = {};
        
        const uploadPromises: Promise<any>[] = [];

        // Dynamic ImageKit Upload Handler under Folder: /drivers/{driverId}
        const docMapping: Record<string, string> = {
            aadhar_front: "aadharFront",
            aadhar_back: "aadharBack",
            license: "license"
        };

        for (const [field, dbField] of Object.entries(docMapping)) {
            if (files[field] && files[field][0]) {
                const file = files[field][0];
                const folderPath = `/drivers/${user._id}`;
                const sanitizedName = `${field}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`;
                
                uploadPromises.push(
                    uploadToImageKit(file as any, sanitizedName, folderPath)
                        .then(url => {
                            updateData.documents[dbField] = url;
                        })
                );
            }
        }
        
        if (files["profile_image"] && files["profile_image"][0]) {
            const file = files["profile_image"][0];
            const folderPath = `/drivers/${user._id}`;
            const sanitizedName = `profile_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`;
            
            uploadPromises.push(
                uploadToImageKit(file as any, sanitizedName, folderPath)
                    .then(url => {
                        updateData.avatar = url;
                    })
            );
        }

        // Wait for all concurrent uploads to finish
        if (uploadPromises.length > 0) {
            await Promise.all(uploadPromises);
        }
    }

    const updatedDriver = await UserModel.findByIdAndUpdate(
        user._id,
        { $set: updateData },
        { new: true }
    ).select("-pinHash");

    if (!updatedDriver) {
        return res.status(404).json({ success: false, message: "Driver not found" });
    }

    if (isNewUser) {
        const { createAuthTokensWithDb } = await import("../services/auth.service.js");
        const ip = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();
        const userAgent = req.headers["user-agent"];
        
        const auth = await createAuthTokensWithDb(updatedDriver as any, ip, userAgent);
        
        return res.json({ 
            success: true,
            message: "Profile updated successfully", 
            user: auth.user,
            token: auth.accessToken,
            refreshToken: auth.refreshToken
        });
    }

    return res.json({ success: true, message: "Profile updated successfully", user: updatedDriver });
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

/**
 * Driver: Delete account permanently
 */
export const deleteDriverAccount = asyncHandler(async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user || (!user._id && !user.id)) {
            return res.status(400).json({ success: false, message: "Driver ID missing" });
        }

        const driverId = user._id || user.id;

        const driver = await UserModel.findById(driverId);
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        if (driver.codBalance && driver.codBalance > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `You have pending COD dues of ₹${driver.codBalance}. Please clear your dues before deleting your account.` 
            });
        }

        if (driver.walletBalance && driver.walletBalance > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `You have a pending payout of ₹${driver.walletBalance}. Please request a withdrawal before deleting your account.` 
            });
        }

        await UserModel.findByIdAndDelete(driverId);
        return res.json({ success: true, message: "Account deleted successfully" });
    } catch (error: any) {
        console.error("Delete driver account error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});
