import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import User from "../models/User.model.js";
import WithdrawalRequest from "../models/WithdrawalRequest.model.js";
import { BadRequestException } from "../utils/appError.js";

/**
 * GET: Rider wallet balance and recent withdrawal requests
 */
export const getWalletSummary = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user.id;
    const driver = await User.findById(driverId).select("walletBalance totalWorkSeconds dailyOnlineSeconds");
    
    const requests = await WithdrawalRequest.find({ driver: driverId })
        .sort({ createdAt: -1 })
        .limit(10);

    return res.json({
        balance: driver?.walletBalance || 0,
        billable_hours: ((driver?.totalWorkSeconds || 0) / 3600).toFixed(1),
        recent_requests: requests
    });
});

/**
 * POST: Create a withdrawal request
 */
export const requestWithdrawal = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) throw new BadRequestException("Invalid withdrawal amount");

    const driver = await User.findById(driverId);
    if (!driver) throw new BadRequestException("Driver not found");

    if (amount > (driver.walletBalance || 0)) {
        throw new BadRequestException("Insufficient balance in wallet");
    }

    // Create the request
    const withdrawal = await WithdrawalRequest.create({
        driver: driverId,
        amount,
        status: "pending"
    });

    // Optionally deduct balance immediately or wait for approval
    // Here we wait for approval before deducting to avoid issues if rejected
    
    return res.json({ message: "Withdrawal request submitted successfully", withdrawal });
});

/**
 * GET: Admin view for all withdrawal requests
 */
export const getAllWithdrawalRequests = asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.query;
    const filter = status ? { status } : {};
    
    const requests = await WithdrawalRequest.find(filter)
        .populate("driver", "name phone riderId")
        .sort({ createdAt: -1 });

    return res.json({ requests });
});

/**
 * PATCH: Admin process withdrawal (Approve/Reject)
 */
export const processWithdrawal = asyncHandler(async (req: Request, res: Response) => {
    const { requestId, status, adminNote } = req.body;

    if (!["approved", "rejected"].includes(status)) {
        throw new BadRequestException("Invalid status update");
    }

    const withdrawal = await WithdrawalRequest.findById(requestId);
    if (!withdrawal) throw new BadRequestException("Request not found");
    if (withdrawal.status !== "pending") throw new BadRequestException("Request already processed");

    const driver = await User.findById(withdrawal.driver);
    if (!driver) throw new BadRequestException("Driver not found");

    if (status === "approved") {
        const currentBalance = driver.walletBalance || 0;
        const currentHours = driver.totalWorkSeconds || 0;

        if (currentBalance < withdrawal.amount) {
            throw new BadRequestException("Driver no longer has sufficient balance");
        }
        
        // Proportional hours deduction
        const deductionRatio = withdrawal.amount / currentBalance;
        const secondsToDeduct = Math.floor(currentHours * deductionRatio);

        // Deduct from wallet and hours
        driver.walletBalance = currentBalance - withdrawal.amount;
        driver.totalWorkSeconds = Math.max(0, currentHours - secondsToDeduct);

        // Reset to exactly 0 if balance is gone
        if (driver.walletBalance <= 0) {
            driver.walletBalance = 0;
            driver.totalWorkSeconds = 0;
        }

        await driver.save();
    }

    withdrawal.status = status as any;
    withdrawal.adminNote = adminNote;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    return res.json({ message: `Withdrawal ${status} successfully`, withdrawal });
});
