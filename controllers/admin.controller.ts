import { Request, Response } from "express";
import User from "../models/User.model.js";
import Order from "../models/Order.model.js";
import Restaurant from "../models/Restaurant.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import Refund from "../models/Refund.model.js";
import CodSettlement from "../models/CodSettlement.model.js";
import { BadRequestException, NotFoundException } from "../utils/appError.js";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Full Dashboard Stats
// ─────────────────────────────────────────────────────────────────────────────
export const getDashboard = async (req: Request, res: Response) => {
    const filter = (req.query.filter as string) || "all";
    
    const dateQuery: any = {};
    const now = new Date();
    if (filter === "today") {
        dateQuery.createdAt = { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
    } else if (filter === "7_days") {
        dateQuery.createdAt = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    } else if (filter === "1_month") {
        dateQuery.createdAt = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    } else if (filter === "1_year") {
        dateQuery.createdAt = { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
    }

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
        User.countDocuments({ role: "customer", ...dateQuery }),
        User.countDocuments({ role: "driver", ...dateQuery }),
        Restaurant.countDocuments({ isActive: true, ...dateQuery }),
        Order.countDocuments(dateQuery),
        Order.countDocuments({ status: { $in: ["preparing", "ready"] }, ...dateQuery }),
        PaymentTransaction.aggregate([
            { $match: { status: "success", ...dateQuery } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Refund.countDocuments({ status: "pending", ...dateQuery }),
        Order.aggregate([
            { $match: dateQuery },
            { $group: { _id: "$status", count: { $sum: 1 }, revenue: { $sum: "$payableAmount" } } },
        ]),
        Order.aggregate([
            { $match: { status: "delivered", ...dateQuery } },
            { $group: { _id: null, totalRestaurantPayouts: { $sum: "$restaurantEarnings" }, totalRiderPayouts: { $sum: "$driverEarnings" }, totalDeliveryCharge: { $sum: "$deliveryCharge" }, riderAdminCommission: { $sum: "$riderAdminCommission" } } }
        ]),
        Order.find({ status: "delivered", ...dateQuery })
            .sort({ deliveredAt: -1, createdAt: -1 })
            .limit(50)
            .populate("store", "name storeType")
            .populate("assignedDriver", "name phone riderId")
            .select("orderNumber totalAmount payableAmount driverEarnings restaurantEarnings deliveryCharge createdAt deliveredAt")
            .lean()
    ]);

    const revenue = totalRevenueAgg[0]?.total ?? 0;
    const restaurantPayouts = payoutsAgg[0]?.totalRestaurantPayouts ?? 0;
    const riderPayouts = payoutsAgg[0]?.totalRiderPayouts ?? 0;
    const netProfit = revenue - restaurantPayouts - riderPayouts;
    const riderAdminCommission = payoutsAgg[0]?.riderAdminCommission ?? 0;

    return res.json({
        users: { customers: totalUsers, drivers: totalDrivers },
        stores: totalStores,
        orders: { total: totalOrders, active: activeOrders, breakdown: orderBreakdown },
        revenue,
        restaurantPayouts,
        riderPayouts,
        netProfit,
        riderAdminCommission,
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

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// ADMIN: Get Rider COD Summary
// ════════════════════════════════════════════════════════════════════════════════════════════════════
export const getRiderCodSummary = async (_req: Request, res: Response) => {
    // Only fetch drivers that have a COD balance > 0
    const drivers = await User.find({ role: "driver", codBalance: { $gt: 0 } })
        .select("name phone riderId codBalance codEarnings walletBalance")
        .lean();

    const codSummary = await Promise.all(drivers.map(async (driver) => {
        const codBalance = driver.codBalance || 0;
        const codEarnings = driver.codEarnings || 0;
        const walletBalance = driver.walletBalance || 0;
        const amountToPayAdmin = Math.max(0, codBalance - codEarnings);
        
        // Find the last full settlement to know which orders are unsettled
        const lastSettlement = await CodSettlement.findOne({ driver: driver._id, type: "full" }).sort({ settledAt: -1 });
        
        const query: any = {
            assignedDriver: driver._id,
            deliveryStatus: "delivered"
        };
        if (lastSettlement) {
            query.deliveredAt = { $gt: lastSettlement.settledAt };
        }

        const recentOrders = await Order.find(query)
            .populate("paymentTransaction")
            .populate("store", "name")
            .lean();
        
        let totalOrders = 0;
        let restaurantPay = 0;
        const restaurants = new Set<string>();

        for (const order of recentOrders) {
            const payment = order.paymentTransaction as any;
            if (payment && payment.provider === "cod") {
                totalOrders++;
                restaurantPay += (order.restaurantEarnings || 0);
                if (order.store && (order.store as any).name) {
                    restaurants.add((order.store as any).name);
                }
            }
        }

        const restaurantNames = Array.from(restaurants).join(", ") || "N/A";

        return {
            _id: driver._id,
            name: driver.name,
            phone: driver.phone,
            riderId: driver.riderId,
            codBalance,
            codEarnings,
            walletBalance,
            amountToPayAdmin,
            totalOrders,
            restaurantPay,
            restaurantNames
        };
    }));

    return res.json({ riders: codSummary });
};

// ==============================================================================================================================
// ADMIN: Settle Rider COD (Full Settlement)
// ==============================================================================================================================
export const settleRiderCod = async (req: Request, res: Response) => {
    const { riderId } = req.body;
    if (!riderId) return res.status(400).json({ message: "Rider ID is required" });

    const driver = await User.findOne({ _id: riderId, role: "driver" });
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const settledAmount = Math.max(0, (driver.codBalance || 0) - (driver.codEarnings || 0));

    driver.codBalance = 0;
    driver.codEarnings = 0;
    await driver.save();

    if (settledAmount > 0) {
        await CodSettlement.create({ driver: driver._id, amount: settledAmount, type: "full" });
    }

    return res.json({ message: "COD settled successfully" });
};

// ==============================================================================================================================
// ADMIN: Deduct Rider COD (Manual Deduction)
// ==============================================================================================================================
export const deductRiderCod = async (req: Request, res: Response) => {
    const { riderId, amount } = req.body;
    if (!riderId || !amount) return res.status(400).json({ message: "Rider ID and amount are required" });

    const driver = await User.findOne({ _id: riderId, role: "driver" });
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const deduction = Number(amount);
    if (isNaN(deduction) || deduction <= 0) return res.status(400).json({ message: "Invalid amount" });

    driver.codBalance = Math.max(0, (driver.codBalance || 0) - deduction);
    await driver.save();

    await CodSettlement.create({ driver: driver._id, amount: deduction, type: "manual" });

    return res.json({ message: `Deducted ₹${deduction} from COD balance` });
};

// ==============================================================================================================================
// ADMIN: Get Rider COD Settlement History
// ==============================================================================================================================
export const getRiderCodHistory = async (req: Request, res: Response) => {
    const { riderId } = req.params;
    const history = await CodSettlement.find({ driver: riderId }).sort({ settledAt: -1 }).lean();
    return res.json({ history });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get Rider Orders Summary
// ─────────────────────────────────────────────────────────────────────────────
export const getRiderOrdersSummary = async (_req: Request, res: Response) => {
    // 1. Fetch all drivers
    const drivers = await User.find({ role: "driver" })
        .select("name phone upi riderId isOnline updatedAt status")
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

    // 3. Aggregate active orders to find "busy" drivers
    const activeStats = await Order.aggregate([
        { $match: { deliveryStatus: { $in: ["assigned", "picked_up"] }, assignedDriver: { $exists: true } } },
        { 
            $group: { 
                _id: "$assignedDriver", 
                activeCount: { $sum: 1 }
            } 
        }
    ]);

    const statsMap = new Map();
    stats.forEach(stat => statsMap.set(stat._id.toString(), stat));

    const activeMap = new Map();
    activeStats.forEach(stat => activeMap.set(stat._id.toString(), stat));

    const riders = drivers.map(d => {
        const stat = statsMap.get(d._id.toString()) || { completedOrders: 0, totalEarnings: 0 };
        const activeStat = activeMap.get(d._id.toString()) || { activeCount: 0 };
        
        let status = "Offline";
        if (d.status === "suspended") {
            status = "Suspended";
        } else if (d.isOnline) {
            status = activeStat.activeCount > 0 ? "Busy" : "Online";
        }

        return {
            ...d,
            completedOrders: stat.completedOrders,
            totalEarnings: stat.totalEarnings,
            status,
            activeCount: activeStat.activeCount,
            lastActive: d.updatedAt
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
    const formattedOrders = orders.map(o => {
        let parsedDrop = o.address;
        if (typeof parsedDrop === 'string' && parsedDrop.startsWith('{')) {
            try { parsedDrop = JSON.parse(parsedDrop); } catch (e) {}
        }
        let dropLoc = "N/A";
        if (typeof parsedDrop === 'object' && parsedDrop !== null) {
            dropLoc = parsedDrop.fullAddress || parsedDrop.formattedAddress || parsedDrop.address || JSON.stringify(parsedDrop);
        } else {
            dropLoc = String(parsedDrop || "N/A");
        }

        return {
            _id: o._id,
            orderNumber: o.orderNumber,
            createdAt: o.createdAt,
            pickupLocation: o.store ? `${(o.store as any).name}, ${(o.store as any).address}` : "Unknown Store",
            dropLocation: dropLoc,
            driverEarnings: o.driverEarnings || 0,
            payableAmount: o.payableAmount
        };
    });

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
    // Only show real customers (exclude admins and drivers)
    const customers = await User.find({ role: "customer" })
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
