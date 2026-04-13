import Order from "../models/Order.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import { Request, Response } from "express";
import mongoose from "mongoose";

export const getOrderStatistics = async (req: Request, res: Response) => {
    const [orderStats] = await Order.aggregate([
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                revenue: { $sum: "$payableAmount" },
            },
        },
    ]);

    const totalOrders = await Order.countDocuments();
    const deliveredOrders = await Order.countDocuments({ status: "delivered" });

    const revenueAgg = await PaymentTransaction.aggregate([
        { $match: { status: "success" } },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
            },
        },
    ]);

    res.json({
        totalOrders,
        deliveredOrders,
        totalRevenue: revenueAgg[0]?.totalRevenue || 0,
        breakdown: orderStats,
    });
};
