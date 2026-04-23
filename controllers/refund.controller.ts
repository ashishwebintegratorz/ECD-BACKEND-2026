import { Request, Response } from "express";
import Refund from "../models/Refund.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: Get my refunds
// ─────────────────────────────────────────────────────────────────────────────
export const getMyRefunds = async (req: Request, res: Response) => {
    const refunds = await Refund.find({ customer: req.user.id })
        .sort({ createdAt: -1 })
        .populate("order", "orderNumber totalAmount status");

    return res.json({ refunds });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get all refunds
// Filter: ?status=pending|processing|completed|failed&from=&to=
// ─────────────────────────────────────────────────────────────────────────────
export const getAllRefunds = async (req: Request, res: Response) => {
    const { status, from, to } = req.query;
    const query: any = {};

    if (status) query.status = status;
    if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = new Date(from as string);
        if (to) query.createdAt.$lte = new Date(to as string);
    }

    const refunds = await Refund.find(query)
        .sort({ createdAt: -1 })
        .populate("order", "orderNumber totalAmount status")
        .populate("customer", "name phone");

    return res.json({ total: refunds.length, refunds });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get refund stats
// ─────────────────────────────────────────────────────────────────────────────
export const getRefundStats = async (_req: Request, res: Response) => {
    const stats = await Refund.aggregate([
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalAmount: { $sum: "$amount" },
            },
        },
    ]);

    return res.json({ stats });
};
