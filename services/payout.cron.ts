import cron from "node-cron";
import Ledger from "../models/Ledger.model.js";
import { format } from "date-fns";
import { processPendingRefunds } from "./refund.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY CRON — Pay Restaurant
// Runs every Monday at 3:00 AM
// Marks all pending restaurant ledger entries as paid
// ─────────────────────────────────────────────────────────────────────────────
const payRestaurants = async () => {
    const batchId = `restaurant-${format(new Date(), "yyyy-'W'ww")}`;
    console.log(`[Cron] Starting restaurant payout batch: ${batchId}`);

    try {
        const pending = await Ledger.find({ party: "store", status: "pending" });

        if (pending.length === 0) {
            console.log(`[Cron] No pending restaurant payouts.`);
            return;
        }

        // Group by restaurant for logging
        const grouped: Record<string, number> = {};
        for (const entry of pending) {
            const key = entry.partyRef.toString();
            grouped[key] = (grouped[key] ?? 0) + entry.amount;
        }

        // Mark all as paid in one bulk operation
        const ids = pending.map((e) => e._id);
        await Ledger.updateMany(
            { _id: { $in: ids } },
            {
                status: "paid",
                paidAt: new Date(),
                payoutBatch: batchId,
            }
        );

        console.log(`[Cron] Restaurant payout complete — batch: ${batchId}`);
        console.log(`[Cron] Paid ${pending.length} entries across ${Object.keys(grouped).length} restaurants:`);
        for (const [restaurantId, total] of Object.entries(grouped)) {
            console.log(`  Restaurant ${restaurantId}: ₹${total}`);
        }
    } catch (err) {
        console.error(`[Cron] Restaurant payout failed:`, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY CRON — Pay Driver
// Runs on the 1st of every month at 3:00 AM
// Marks all pending driver ledger entries as paid
// ─────────────────────────────────────────────────────────────────────────────
const payDrivers = async () => {
    const batchId = `driver-${format(new Date(), "yyyy-MM")}`;
    console.log(`[Cron] Starting driver payout batch: ${batchId}`);

    try {
        const pending = await Ledger.find({ party: "driver", status: "pending" });

        if (pending.length === 0) {
            console.log(`[Cron] No pending driver payouts.`);
            return;
        }

        // Group by driver for logging
        const grouped: Record<string, number> = {};
        for (const entry of pending) {
            const key = entry.partyRef.toString();
            grouped[key] = (grouped[key] ?? 0) + entry.amount;
        }

        const ids = pending.map((e) => e._id);
        await Ledger.updateMany(
            { _id: { $in: ids } },
            {
                status: "paid",
                paidAt: new Date(),
                payoutBatch: batchId,
            }
        );

        console.log(`[Cron] Driver payout complete — batch: ${batchId}`);
        console.log(`[Cron] Paid ${pending.length} entries across ${Object.keys(grouped).length} drivers:`);
        for (const [driverId, total] of Object.entries(grouped)) {
            console.log(`  Driver ${driverId}: ₹${total}`);
        }
    } catch (err) {
        console.error(`[Cron] Driver payout failed:`, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER CRON JOBS
// Call this once from server.ts after DB connects
// ─────────────────────────────────────────────────────────────────────────────
export const registerPayoutCrons = () => {
    // Every Monday at 3:00 AM  →  "0 3 * * 1"
    cron.schedule("0 3 * * 1", payRestaurants, {
        timezone: "Asia/Kolkata",
    });

    // 1st of every month at 3:00 AM  →  "0 3 1 * *"
    cron.schedule("0 3 1 * *", payDrivers, {
        timezone: "Asia/Kolkata",
    });

    console.log("[ECD KART Cron] Payout cron jobs registered:");
    console.log("  Restaurant payout → Every Monday at 3:00 AM IST");
    console.log("  Driver payout     → 1st of every month at 3:00 AM IST");

    // Every hour — process pending Razorpay refunds
    cron.schedule("0 * * * *", processPendingRefunds, {
        timezone: "Asia/Kolkata",
    });
    console.log("  Refund processor  → Every hour");
};
