import { Request, Response } from "express";
import Ledger from "../models/Ledger.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get all ledger entries
// Filter: ?party=restaurant|driver|platform&status=pending|paid&from=&to=
// ─────────────────────────────────────────────────────────────────────────────
export const getLedgerEntries = async (req: Request, res: Response) => {
    const { party, status, partyRef, from, to } = req.query;
    const query: any = {};

    if (party) query.party = party;
    if (status) query.status = status;
    if (partyRef) query.partyRef = partyRef;
    if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = new Date(from as string);
        if (to) query.createdAt.$lte = new Date(to as string);
    }

    const entries = await Ledger.find(query)
        .sort({ createdAt: -1 })
        .populate("order", "orderNumber totalAmount payableAmount status");

    return res.json({ total: entries.length, entries });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Ledger summary — pending/paid amounts per party type
// ─────────────────────────────────────────────────────────────────────────────
export const getLedgerSummary = async (_req: Request, res: Response) => {
    const summary = await Ledger.aggregate([
        {
            $group: {
                _id: { party: "$party", status: "$status" },
                totalAmount: { $sum: "$amount" },
                count: { $sum: 1 },
            },
        },
        { $sort: { "_id.party": 1, "_id.status": 1 } },
    ]);

    return res.json({ summary });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Payout history grouped by batch
// ─────────────────────────────────────────────────────────────────────────────
export const getPayoutBatches = async (_req: Request, res: Response) => {
    const batches = await Ledger.aggregate([
        { $match: { status: "paid", payoutBatch: { $exists: true, $ne: null } } },
        {
            $group: {
                _id: "$payoutBatch",
                party: { $first: "$party" },
                totalAmount: { $sum: "$amount" },
                count: { $sum: 1 },
                paidAt: { $max: "$paidAt" },
            },
        },
        { $sort: { paidAt: -1 } },
    ]);

    return res.json({ batches });
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER: My Earnings Dashboard
// GET /api/v1/ledger/driver/dashboard
// Shows: total earned, pending payout, paid out, recent entries
// ─────────────────────────────────────────────────────────────────────────────
export const getDriverDashboard = async (req: Request, res: Response) => {
    const driverId = req.user.id;

    const [stats, recentEntries] = await Promise.all([
        Ledger.aggregate([
            { $match: { party: "driver", partyRef: driverId } },
            {
                $group: {
                    _id: "$status",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
        ]),
        Ledger.find({ party: "driver", partyRef: driverId })
            .sort({ createdAt: -1 })
            .limit(20)
            .populate("order", "orderNumber totalAmount status createdAt"),
    ]);

    // Build clean summary
    const summary = { totalEarned: 0, pendingPayout: 0, alreadyPaid: 0, totalOrders: 0 };
    for (const s of stats) {
        if (s._id === "pending") {
            summary.pendingPayout = s.totalAmount;
            summary.totalOrders += s.count;
        }
        if (s._id === "paid") {
            summary.alreadyPaid = s.totalAmount;
            summary.totalOrders += s.count;
        }
        summary.totalEarned = summary.pendingPayout + summary.alreadyPaid;
    }

    return res.json({
        dashboard: {
            totalEarned: summary.totalEarned,   // all time
            pendingPayout: summary.pendingPayout, // will be paid on 1st of next month
            alreadyPaid: summary.alreadyPaid,   // already received
            totalOrders: summary.totalOrders,
        },
        recentEntries,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: My Earnings Dashboard
// GET /api/v1/ledger/restaurant/dashboard
// Shows: total earned, pending payout, paid out, recent entries
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantDashboard = async (req: Request, res: Response) => {
    // restaurantId passed as query param (admin manages restaurants, not direct login)
    // For now: admin passes ?restaurantId= OR restaurant owner uses their own ID
    const restaurantId = (req.query.restaurantId as string) || req.user.id;

    const [stats, recentEntries] = await Promise.all([
        Ledger.aggregate([
            { $match: { party: "store", partyRef: restaurantId } },
            {
                $group: {
                    _id: "$status",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
        ]),
        Ledger.find({ party: "store", partyRef: restaurantId })
            .sort({ createdAt: -1 })
            .limit(20)
            .populate("order", "orderNumber totalAmount status createdAt"),
    ]);

    const summary = { totalEarned: 0, pendingPayout: 0, alreadyPaid: 0, totalOrders: 0 };
    for (const s of stats) {
        if (s._id === "pending") {
            summary.pendingPayout = s.totalAmount;
            summary.totalOrders += s.count;
        }
        if (s._id === "paid") {
            summary.alreadyPaid = s.totalAmount;
            summary.totalOrders += s.count;
        }
        summary.totalEarned = summary.pendingPayout + summary.alreadyPaid;
    }

    return res.json({
        dashboard: {
            totalEarned: summary.totalEarned,
            pendingPayout: summary.pendingPayout, // will be paid next Monday
            alreadyPaid: summary.alreadyPaid,
            totalOrders: summary.totalOrders,
        },
        recentEntries,
    });
};
