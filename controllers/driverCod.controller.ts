import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import User from "../models/User.model.js";
import { razorpay } from "../config/razorpay.config.js";
import crypto from "crypto";

export const getCodBalance = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user.id;
    const driver = await User.findById(driverId).select("codBalance codEarnings walletBalance");
    
    if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
    }

    const codBalance = driver.codBalance || 0;
    const codEarnings = driver.codEarnings || 0;
    const walletBalance = driver.walletBalance || 0;
    const amountToPay = Math.max(0, codBalance - codEarnings);

    return res.json({
        codBalance,
        codEarnings,
        walletBalance,
        amountToPay
    });
});

export const initiateCodPayment = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user.id;
    const driver = await User.findById(driverId);
    
    if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
    }

    const codBalance = driver.codBalance || 0;
    const codEarnings = driver.codEarnings || 0;
    const amountToPay = Math.max(0, codBalance - codEarnings);

    if (amountToPay <= 0) {
        return res.status(400).json({ message: "No pending COD balance to pay" });
    }

    const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(amountToPay * 100), // convert to paise
        currency: "INR",
        receipt: `cod_${driver._id.toString().slice(-6)}_${Date.now()}`,
        payment_capture: true,
    });

    return res.json({
        razorpayOrderId: razorpayOrder.id,
        amount: amountToPay,
        currency: "INR",
    });
});

export const verifyCodPayment = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

    if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ message: "Invalid payment signature" });
    }

    const driver = await User.findById(driverId);
    if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
    }

    // Reset COD balance and earnings as the settlement is complete
    driver.codBalance = 0;
    driver.codEarnings = 0;
    
    await driver.save();

    return res.json({ message: "COD settlement successful!", codBalance: 0, codEarnings: 0, walletBalance: driver.walletBalance || 0 });
});
