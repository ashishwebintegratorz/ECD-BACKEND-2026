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
        totalRevenue,
        pendingRefunds,
        orderBreakdown,
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
    ]);

    return res.json({
        users: { customers: totalUsers, drivers: totalDrivers },
        stores: totalStores,
        orders: { total: totalOrders, active: activeOrders, breakdown: orderBreakdown },
        revenue: totalRevenue[0]?.total ?? 0,
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
    const { status, isVerified, documents } = req.body;
    
    const updateData: any = {};
    if (status) updateData.status = status;
    if (typeof isVerified === "boolean") updateData.isVerified = isVerified;
    if (documents) updateData.documents = documents;

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
