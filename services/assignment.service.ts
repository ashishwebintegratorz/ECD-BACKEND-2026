import Order from "../models/Order.model.js";
import User from "../models/User.model.js";
import DriverLocation from "../models/DriverLocation.model.js";
import { emitOrderAssignedToDriver, emitOrderStatusUpdate } from "../socket/orderSocket.js";
import { haversineDistance } from "../utils/delivery.utils.js";
import { notifyDriverAssigned } from "./notification.service.js";

const ASSIGNMENT_TIMEOUT_MS = 60000; // 60 seconds (1 minute)

/**
 * Handles the assignment flow for a driver, including real-time notifications
 * and the 60-second acceptance timeout.
 */
export const startAssignmentFlow = async (orderId: string, driverId: string) => {
    const order = await Order.findById(orderId).populate("store");
    if (!order) return;

    const timeout = new Date(Date.now() + ASSIGNMENT_TIMEOUT_MS);
    
    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    order.assignedDriver = driverId as any;
    order.deliveryStatus = "driver_notified";
    order.deliveryOTP = otp;
    if (!order.pickupOtp) {
        order.pickupOtp = Math.floor(1000 + Math.random() * 9000).toString();
    }
    order.assignmentTimeoutAt = timeout;
    await order.save();

    // Get restaurant info
    const restaurant: any = order.store;
    const storeLocation = restaurant?.location?.coordinates || [0, 0]; // [lng, lat]

    // Get driver location to calculate distance
    const driverLoc = await DriverLocation.findOne({ driver: driverId });
    const driverCoords = driverLoc?.location?.coordinates || [0, 0]; // [lng, lat]

    const distance = haversineDistance(
        driverCoords[1], driverCoords[0],
        storeLocation[1], storeLocation[0]
    ).toFixed(1);

    // Prepare payload for the 4-sided timer popup on the rider app
    emitOrderAssignedToDriver(driverId, {
        orderId: order._id,
        orderNumber: order.orderNumber,
        restaurantName: restaurant?.name || "Restaurant",
        restaurantAddress: restaurant?.address || "Store Address",
        distanceToStore: `${distance} km`,
        deliveryAddress: typeof order.address === "string" ? order.address : (order.address?.address || "Customer Address"),
        estimatedEarnings: order.driverEarnings || 30,
        timeoutAt: timeout,
    });

    // Send push notification
    notifyDriverAssigned(driverId, order.orderNumber, order._id.toString()).catch(() => {});

    // Timeout Logic: If the driver doesn't accept/decline within 60s, unassign them
    setTimeout(async () => {
        const currentOrder = await Order.findById(orderId);
        
        // Only unassign if the status is still 'driver_notified' (meaning no action taken)
        if (currentOrder && currentOrder.deliveryStatus === "driver_notified" && String(currentOrder.assignedDriver) === String(driverId)) {
            currentOrder.assignedDriver = undefined;
            currentOrder.deliveryStatus = "pending";
            currentOrder.assignmentTimeoutAt = undefined;
            if (!currentOrder.rejectedDrivers) currentOrder.rejectedDrivers = [];
            currentOrder.rejectedDrivers.push(driverId as any);
            await currentOrder.save();

            // Notify admin/system that assignment failed
            emitOrderStatusUpdate(orderId, {
                deliveryStatus: "pending",
                message: "Driver assignment timed out. Please re-assign.",
            });

            // Re-assign to next nearest driver logic
            assignToNearestDriver(orderId, [driverId]); 
        }
    }, ASSIGNMENT_TIMEOUT_MS);
};

/**
 * Automatically assign order to the nearest available driver
 */
export const assignToNearestDriver = async (orderId: string, excludeDriverIds: string[] = []) => {
    const order = await Order.findById(orderId).populate("store");
    if (!order) return;

    if (order.status !== "ready") return; // Only assign when order is ready
    if (order.assignedDriver) return; // Already assigned

    const restaurant: any = order.store;
    if (!restaurant?.location?.coordinates) return;

    const [storeLng, storeLat] = restaurant.location.coordinates;

    // Find all online, non-busy drivers
    const onlineDrivers = await User.find({ role: "driver", isOnline: true, isReturning: false });
    
    let nearestDriverId = null;
    let minDistance = Infinity;

    const excludedIds = [...excludeDriverIds, ...(order.rejectedDrivers || []).map((id: any) => id.toString())];

    for (const driver of onlineDrivers) {
        if (excludedIds.includes(driver._id.toString())) continue;

        // Check if driver has active order
        const activeOrder = await Order.findOne({
            assignedDriver: driver._id,
            deliveryStatus: { $in: ["assigned", "driver_notified", "accepted", "out_for_delivery"] }
        });

        if (!activeOrder) {
            // Driver is free, get their location
            const loc = await DriverLocation.findOne({ driver: driver._id });
            
            // If no location found or it hasn't been updated in 2 minutes, consider them offline
            if (!loc || !loc.updatedAt) {
                continue; // Skip drivers with no location
            }

            const diffMs = Date.now() - loc.updatedAt.getTime();
            if (diffMs > 60 * 60 * 1000) { // 60 minutes staleness
                continue; // Skip this driver if location is extremely old
            }
            
            const [lng, lat] = loc.location.coordinates; 
            const distance = haversineDistance(lat, lng, storeLat, storeLng);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestDriverId = driver._id.toString();
            }
        }
    }

    if (nearestDriverId) {
        console.log(`[Auto-Assign] Found nearest driver ${nearestDriverId} for order ${orderId} (Distance: ${minDistance.toFixed(2)} km)`);
        await startAssignmentFlow(orderId, nearestDriverId);
        return true;
    } else {
        console.log(`[Auto-Assign] No available drivers for order ${orderId}`);
        
        // Update database so subsequent fetches know there are no riders
        await Order.findByIdAndUpdate(orderId, { deliveryStatus: "driver_not_found" });

        // Notify restaurant that no driver was found instead of spinning forever
        emitOrderStatusUpdate(orderId, {
            status: "ready", // keep it ready so they can try again
            deliveryStatus: "driver_not_found",
            message: "No available riders found. Please try assigning again.",
        });
        return false;
    }
};
