import { Request, Response } from "express";
import User from "../models/User.model.js";
import Order from "../models/Order.model.js";
import Restaurant from "../models/Restaurant.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import Refund from "../models/Refund.model.js";
import { BadRequestException, NotFoundException } from "../utils/appError.js";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Full Dashboard Stats
// ─────────────────────────────────────────────────────────────────────────────
export const getDashboard = async (_req: Request, res: Response) => {
    const [
        totalUsers,
        totalDrivers,
        totalStores,
        totalOrders,
        activeOrders,
        totalRevenueAgg,
        pendingRefunds,
        orderBreakdown,
        payoutsAgg,
        recentOrders,
    ] = await Promise.all([
        User.countDocuments({ role: "customer" }),
        User.countDocuments({ role: "driver" }),
        Restaurant.countDocuments({ isActive: true }),
        Order.countDocuments(),
        Order.countDocuments({ status: { $in: ["preparing", "ready"] } }),
        PaymentTransaction.aggregate([
            { $match: { status: "success" } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Refund.countDocuments({ status: "pending" }),
        Order.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 }, revenue: { $sum: "$payableAmount" } } },
        ]),
        Order.aggregate([
            { $match: { status: "delivered" } },
            { $group: { _id: null, totalRestaurantPayouts: { $sum: "$restaurantEarnings" }, totalRiderPayouts: { $sum: "$driverEarnings" } } }
        ]),
        Order.find({ status: "delivered" })
            .sort({ deliveredAt: -1, createdAt: -1 })
            .limit(10)
            .populate("store", "name storeType")
            .populate("assignedDriver", "name phone riderId")
            .select("orderNumber totalAmount payableAmount driverEarnings restaurantEarnings createdAt deliveredAt")
            .lean()
    ]);

    const revenue = totalRevenueAgg[0]?.total ?? 0;
    const restaurantPayouts = payoutsAgg[0]?.totalRestaurantPayouts ?? 0;
    const riderPayouts = payoutsAgg[0]?.totalRiderPayouts ?? 0;
    const netProfit = revenue - restaurantPayouts - riderPayouts;

    return res.json({
        users: { customers: totalUsers, drivers: totalDrivers },
        stores: totalStores,
        orders: { total: totalOrders, active: activeOrders, breakdown: orderBreakdown },
        revenue,
        restaurantPayouts,
        riderPayouts,
        netProfit,
        recentOrders,
        pendingRefunds,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get all users with filters
// ?role=customer|driver|admin&search=&page=&limit=
// ─────────────────────────────────────────────────────────────────────────────
export const getAllUsers = async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const role = req.query.role as string | undefined;
    const search = req.query.search as string | undefined;

    const query: any = {};
    if (role) query.role = role;
    if (search) {
        query.$or = [
            { name: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
        ];
    }

    const [users, total] = await Promise.all([
        User.find(query)
            .select("-pinHash")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        User.countDocuments(query),
    ]);

    return res.json({ users, total, totalPages: Math.ceil(total / limit), page, limit });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get user by ID
// ─────────────────────────────────────────────────────────────────────────────
export const getUserById = async (req: Request, res: Response) => {
    const user = await User.findById(req.params.id).select("-pinHash").populate("addresses");
    if (!user) throw new NotFoundException("User not found");
    return res.json({ user });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Update user role
// ─────────────────────────────────────────────────────────────────────────────
export const updateUserRole = async (req: Request, res: Response) => {
    const { role } = req.body;
    const allowed = ["customer", "driver", "admin"];

    if (!role || !allowed.includes(role))
        throw new BadRequestException(`role must be one of: ${allowed.join(", ")}`);

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true }
    ).select("-pinHash");

    if (!user) throw new NotFoundException("User not found");

    return res.json({ message: "User role updated", user });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Block / Unblock user (set isVerified = false to block)
// ─────────────────────────────────────────────────────────────────────────────
export const toggleUserBlock = async (req: Request, res: Response) => {
    const { blocked } = req.body;

    if (typeof blocked !== "boolean")
        throw new BadRequestException("blocked must be a boolean");

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { isVerified: !blocked },
        { new: true }
    ).select("-pinHash");

    if (!user) throw new NotFoundException("User not found");

    return res.json({
        message: blocked ? "User blocked" : "User unblocked",
        user,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Update user details (documents, status, isVerified)
// ─────────────────────────────────────────────────────────────────────────────
export const updateUserDetails = async (req: Request, res: Response) => {
    const { status, isVerified, documents, avatar } = req.body;
    
    const updateData: any = {};
    if (status) updateData.status = status;
    if (typeof isVerified === "boolean") updateData.isVerified = isVerified;
    if (documents) updateData.documents = documents;
    if (avatar) updateData.avatar = avatar;

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true }
    ).select("-pinHash");

    if (!user) throw new NotFoundException("User not found");

    return res.json({ message: "User details updated successfully", user });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Revenue stats by date range
// ?from=2026-01-01&to=2026-12-31
// ─────────────────────────────────────────────────────────────────────────────
export const getRevenueStats = async (req: Request, res: Response) => {
    const { from, to } = req.query;
    const match: any = { status: "success" };

    if (from || to) {
        match.createdAt = {};
        if (from) match.createdAt.$gte = new Date(from as string);
        if (to) match.createdAt.$lte = new Date(to as string);
    }

    const [daily, total] = await Promise.all([
        PaymentTransaction.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        PaymentTransaction.aggregate([
            { $match: match },
            { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
    ]);

    return res.json({
        total: total[0]?.total ?? 0,
        orders: total[0]?.count ?? 0,
        daily,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Store performance stats
// ─────────────────────────────────────────────────────────────────────────────
export const getStoreStats = async (_req: Request, res: Response) => {
    const stats = await Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        {
            $group: {
                _id: "$store",
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$payableAmount" },
            },
        },
        { $sort: { totalOrders: -1 } },
        { $limit: 20 },
        {
            $lookup: {
                from: "restaurants",
                localField: "_id",
                foreignField: "_id",
                as: "store",
            },
        },
        { $unwind: "$store" },
        {
            $project: {
                storeName: "$store.name",
                storeType: "$store.storeType",
                totalOrders: 1,
                totalRevenue: 1,
            },
        },
    ]);

    return res.json({ stats });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Live orders (preparing + ready + out_for_delivery)
// ─────────────────────────────────────────────────────────────────────────────
export const getLiveOrders = async (_req: Request, res: Response) => {
    const orders = await Order.find({
        status: { $in: ["preparing", "ready"] },
    })
        .sort({ createdAt: -1 })
        .populate("customer", "name phone")
        .populate("store", "name storeType")
        .populate("assignedDriver", "name phone isOnline");

    return res.json({ total: orders.length, orders });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get all restaurants for payouts
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantPayouts = async (_req: Request, res: Response) => {
    const restaurants = await Restaurant.find()
        .select("name phone upi walletBalance isActive storeType")
        .sort({ walletBalance: -1 });

    return res.json({ restaurants });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Process restaurant payout (manual deduction)
// ─────────────────────────────────────────────────────────────────────────────
import { notifyRestaurantPayout } from "../services/notification.service.js";

export const processRestaurantPayout = async (req: Request, res: Response) => {
    const { restaurantId, deductAmount } = req.body;

    if (!restaurantId || !deductAmount || deductAmount <= 0) {
        throw new BadRequestException("Invalid restaurantId or deductAmount");
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
        throw new NotFoundException("Restaurant not found");
    }

    if (deductAmount > (restaurant.walletBalance || 0)) {
        throw new BadRequestException("Deduct amount exceeds current wallet balance");
    }

    // Deduct the amount
    restaurant.walletBalance -= deductAmount;
    
    if (restaurant.walletBalance < 0) {
        restaurant.walletBalance = 0;
    }

    await restaurant.save();

    // Send push notification to the restaurant app
    await notifyRestaurantPayout(restaurant._id.toString(), deductAmount);

    return res.json({
        message: `Payout of ₹${deductAmount} processed successfully`,
        restaurant
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get Rider Orders Summary
// ─────────────────────────────────────────────────────────────────────────────
export const getRiderOrdersSummary = async (_req: Request, res: Response) => {
    // 1. Fetch all drivers
    const drivers = await User.find({ role: "driver" })
        .select("name phone upi riderId")
        .lean();

    // 2. Aggregate completed orders count and earnings per driver
    const stats = await Order.aggregate([
        { $match: { deliveryStatus: "delivered", assignedDriver: { $exists: true } } },
        { 
            $group: { 
                _id: "$assignedDriver", 
                completedOrders: { $sum: 1 },
                totalEarnings: { $sum: "$driverEarnings" }
            } 
        }
    ]);

    const statsMap = new Map();
    stats.forEach(stat => statsMap.set(stat._id.toString(), stat));

    const riders = drivers.map(d => {
        const stat = statsMap.get(d._id.toString()) || { completedOrders: 0, totalEarnings: 0 };
        return {
            ...d,
            completedOrders: stat.completedOrders,
            totalEarnings: stat.totalEarnings
        };
    }).sort((a, b) => b.completedOrders - a.completedOrders); // Sort by highest orders

    return res.json({ riders });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get Order History for a specific Rider
// ─────────────────────────────────────────────────────────────────────────────
export const getRiderOrderHistory = async (req: Request, res: Response) => {
    const { id } = req.params;

    const orders = await Order.find({ assignedDriver: id, deliveryStatus: "delivered" })
        .select("orderNumber payableAmount driverEarnings address store createdAt")
        .populate("store", "name address")
        .sort({ createdAt: -1 })
        .lean();

    // Formatting for frontend convenience
    const formattedOrders = orders.map(o => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        pickupLocation: o.store ? `${(o.store as any).name}, ${(o.store as any).address}` : "Unknown Store",
        dropLocation: typeof o.address === 'object' && o.address !== null 
            ? o.address.formattedAddress || JSON.stringify(o.address) 
            : o.address,
        driverEarnings: o.driverEarnings || 0,
        payableAmount: o.payableAmount
    }));

    return res.json({ orders: formattedOrders });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get suspended / blocked accounts
// ─────────────────────────────────────────────────────────────────────────────
export const getSuspendedAccounts = async (_req: Request, res: Response) => {
    const [suspendedRiders, suspendedRestaurants] = await Promise.all([
        User.find({ role: "driver", status: "suspended" }).select("name phone riderId createdAt").lean(),
        Restaurant.find({ isActive: false }).select("name phone address storeType createdAt").lean()
    ]);

    return res.json({ suspendedRiders, suspendedRestaurants });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Delete Restaurant
// ─────────────────────────────────────────────────────────────────────────────
export const deleteRestaurant = async (req: Request, res: Response) => {
    const { id } = req.params;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
        throw new NotFoundException("Restaurant not found");
    }

    // Instead of actual deletion, we can hard delete or soft delete.
    // The user explicitly requested "Delete restaurant option", so let's do a hard delete
    // Note: To prevent breaking references in orders, a soft delete is usually better,
    // but we will do a hard delete for now as per simple requirement, or maybe soft delete.
    // Let's hard delete.
    await Restaurant.findByIdAndDelete(id);

    return res.json({ message: "Restaurant successfully deleted" });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get Customer Summary
// ─────────────────────────────────────────────────────────────────────────────
export const getCustomerSummary = async (req: Request, res: Response) => {
    const customers = await User.find({ role: { $nin: ["driver", "admin"] } })
        .populate("addresses")
        .sort({ createdAt: -1 })
        .lean();

    // Fetch order counts
    const customerStats = await Promise.all(
        customers.map(async (customer) => {
            const orderCount = await Order.countDocuments({ customer: customer._id });
            return {
                ...customer,
                orderCount
            };
        })
    );

    return res.json({ customers: customerStats });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get Customer Order History
// ─────────────────────────────────────────────────────────────────────────────
export const getCustomerOrderHistory = async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const orders = await Order.find({ customer: id })
        .sort({ createdAt: -1 })
        .populate("store", "name")
        .populate("assignedDriver", "name")
        .lean();

    return res.json({ orders });
};
