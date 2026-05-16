import Order from "../models/Order.model.js";
import User from "../models/User.model.js";
import DriverLocation from "../models/DriverLocation.model.js";
import { emitOrderAssignedToDriver, emitOrderStatusUpdate } from "../socket/orderSocket.js";
import { haversineDistance } from "../utils/delivery.utils.js";

const ASSIGNMENT_TIMEOUT_MS = 60000; // 60 seconds

/**
 * Handles the assignment flow for a driver, including real-time notifications
 * and the 60-second acceptance timeout.
 */
export const startAssignmentFlow = async (orderId: string, driverId: string) => {
    const order = await Order.findById(orderId).populate("store");
    if (!order) return;

    const timeout = new Date(Date.now() + ASSIGNMENT_TIMEOUT_MS);
    
    order.assignedDriver = driverId as any;
    order.deliveryStatus = "driver_notified";
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
        estimatedEarnings: order.deliveryCharge || 30,
        timeoutAt: timeout,
    });

    // Timeout Logic: If the driver doesn't accept/decline within 60s, unassign them
    setTimeout(async () => {
        const currentOrder = await Order.findById(orderId);
        
        // Only unassign if the status is still 'driver_notified' (meaning no action taken)
        if (currentOrder && currentOrder.deliveryStatus === "driver_notified" && String(currentOrder.assignedDriver) === String(driverId)) {
            currentOrder.assignedDriver = undefined;
            currentOrder.deliveryStatus = "pending";
            currentOrder.assignmentTimeoutAt = undefined;
            await currentOrder.save();

            // Notify admin/system that assignment failed
            emitOrderStatusUpdate(orderId, {
                deliveryStatus: "pending",
                message: "Driver assignment timed out. Please re-assign.",
            });

            console.log(`[Assignment] Order ${orderId} timed out for driver ${driverId}`);
        }
    }, ASSIGNMENT_TIMEOUT_MS);
};
