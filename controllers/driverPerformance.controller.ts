import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { getDailySummary, getMonthlyStats } from "../services/driverPerformance.service.js";

/**
 * GET: Today's Shift Summary
 */
export const getDriverSummary = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user.id;
    const summary = await getDailySummary(driverId);
    return res.json(summary);
});

/**
 * GET: Monthly performance stats (order counts)
 */
export const getMonthlyPerformance = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user.id;
    const stats = await getMonthlyStats(driverId);
    return res.json({ stats });
});
