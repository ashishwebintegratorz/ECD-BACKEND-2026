import { Types } from "mongoose";
import Order from "../models/Order.model.js";
import User from "../models/User.model.js";

/**
 * Calculate and update driver performance metrics after a successful delivery
 */
export const updatePerformanceOnDelivery = async (orderId: string, driverId: string) => {
    const order = await Order.findById(orderId);
    if (!order || !order.acceptedAt || !order.deliveredAt) return;

    const durationSeconds = Math.floor((order.deliveredAt.getTime() - order.acceptedAt.getTime()) / 1000);
    
    await User.findByIdAndUpdate(driverId, {
        $inc: { 
            dailyOnlineSeconds: durationSeconds,
            totalWorkSeconds: durationSeconds
            // walletBalance is intentionally omitted here to prevent double-crediting, 
            // as it is already credited in orders.controller.ts (using driverEarnings).
        }
    });
};

/**
 * Fetch today's summary for a driver, with auto-reset logic
 */
export const getDailySummary = async (driverId: string) => {
    const driver = await User.findById(driverId);
    if (!driver) throw new Error("Driver not found");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Auto-reset daily stats if last reset was before today
    const lastReset = driver.lastShiftReset || new Date(0);
    if (lastReset < today) {
        driver.dailyOnlineSeconds = 0;
        driver.lastShiftReset = new Date();
        await driver.save();
    }

    const orders = await Order.find({
        assignedDriver: driverId,
        deliveryStatus: "delivered",
        updatedAt: { $gte: today }
    });

    const earnings = orders.reduce((sum, o) => sum + (o.driverEarnings || o.deliveryCharge || 0), 0);
    const orderCount = orders.length;

    return {
        earnings,
        orders_completed: orderCount,
        ride_time_seconds: driver.dailyOnlineSeconds || 0,
        wallet_balance: driver.walletBalance || 0,
        is_online: driver.isOnline,
        is_returning: driver.isReturning,
        avg_rating: 4.8
    };
};

/**
 * Get order counts grouped by month for the current year
 */
export const getMonthlyStats = async (driverId: string) => {
    const year = new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    
    const stats = await Order.aggregate([
        {
            $match: {
                assignedDriver: new Types.ObjectId(driverId),
                deliveryStatus: "delivered",
                createdAt: { $gte: startOfYear }
            }
        },
        {
            $group: {
                _id: { $month: "$createdAt" },
                count: { $sum: 1 }
            }
        },
        { $sort: { "_id": 1 } }
    ]);

    // Map month numbers to names
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const result = monthNames.map((name, index) => {
        const monthStat = stats.find(s => s._id === index + 1);
        return { month: name, count: monthStat ? monthStat.count : 0 };
    });

    return result;
};
