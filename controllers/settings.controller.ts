import { Request, Response } from "express";
import DeliverySetting from "../models/DeliverySetting.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get Delivery Settings
// ─────────────────────────────────────────────────────────────────────────────
export const getDeliverySettings = async (_req: Request, res: Response) => {
    let settings = await DeliverySetting.findOne();
    
    // Create defaults if not exists
    if (!settings) {
        settings = await DeliverySetting.create({});
    }

    return res.json({ settings });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Update Delivery Settings
// ─────────────────────────────────────────────────────────────────────────────
export const updateDeliverySettings = async (req: Request, res: Response) => {
    const { morningShift, nightShift, isCodEnabled } = req.body;

    let settings = await DeliverySetting.findOne();
    if (!settings) {
        settings = new DeliverySetting();
    }

    if (morningShift) {
        if (morningShift.riderFeePerKm !== undefined) settings.morningShift.riderFeePerKm = morningShift.riderFeePerKm;
        if (morningShift.adminCommissionPerKm !== undefined) settings.morningShift.adminCommissionPerKm = morningShift.adminCommissionPerKm;
    }

    if (nightShift) {
        if (nightShift.riderFeePerKm !== undefined) settings.nightShift.riderFeePerKm = nightShift.riderFeePerKm;
        if (nightShift.adminCommissionPerKm !== undefined) settings.nightShift.adminCommissionPerKm = nightShift.adminCommissionPerKm;
    }

    if (isCodEnabled !== undefined) {
        settings.isCodEnabled = isCodEnabled;
    }

    await settings.save();

    return res.json({ message: "Delivery settings updated successfully", settings });
};
