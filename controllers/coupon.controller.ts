import { Request, Response } from "express";
import Coupon from "../models/Coupon.model.js";
import { validateCoupon } from "../services/coupon.service.js";
import { BadRequestException, NotFoundException } from "../utils/appError.js";

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: Validate a coupon before applying
// ─────────────────────────────────────────────────────────────────────────────
export const validateCouponEndpoint = async (req: Request, res: Response) => {
    const { code, storeId, orderAmount } = req.body;

    if (!code) throw new BadRequestException("Coupon code is required");
    if (!storeId) throw new BadRequestException("storeId is required");
    if (!orderAmount) throw new BadRequestException("orderAmount is required");

    const result = await validateCoupon(code, req.user.id, storeId, Number(orderAmount));

    if (!result.ok) return res.status(400).json({ message: result.message });

    return res.json({
        valid: true,
        discountAmount: result.discountAmount,
        message: `Coupon applied! You save ₹${result.discountAmount}`,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: List active coupons (global + store-specific)
// ─────────────────────────────────────────────────────────────────────────────
export const getActiveCoupons = async (req: Request, res: Response) => {
    const { storeId } = req.query;
    const now = new Date();

    const query: any = {
        active: true,
        $or: [{ validTo: { $gte: now } }, { validTo: null }],
    };

    // Return global coupons + store-specific coupons for this store
    if (storeId) {
        query.$and = [
            { $or: [{ restaurantId: null }, { restaurantId: storeId }] },
        ];
    } else {
        query.restaurantId = null; // only global coupons
    }

    const coupons = await Coupon.find(query)
        .select("code description discountType discountValue minOrderValue maxDiscountValue validTo")
        .sort({ createdAt: -1 });

    return res.json({ coupons });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Create coupon
// ─────────────────────────────────────────────────────────────────────────────
export const createCoupon = async (req: Request, res: Response) => {
    const {
        code, description, discountType, discountValue,
        minOrderValue, maxDiscountValue, usageLimit,
        perUserLimit, validFrom, validTo, restaurantId,
    } = req.body;

    if (!code) throw new BadRequestException("code is required");
    if (!discountType) throw new BadRequestException("discountType is required (percent|fixed)");
    if (!discountValue) throw new BadRequestException("discountValue is required");

    const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (existing) throw new BadRequestException("Coupon code already exists");

    const coupon = await Coupon.create({
        code: code.toUpperCase().trim(),
        description,
        discountType,
        discountValue: Number(discountValue),
        minOrderValue: minOrderValue ? Number(minOrderValue) : undefined,
        maxDiscountValue: maxDiscountValue ? Number(maxDiscountValue) : undefined,
        usageLimit: usageLimit ? Number(usageLimit) : undefined,
        perUserLimit: perUserLimit ? Number(perUserLimit) : undefined,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validTo: validTo ? new Date(validTo) : undefined,
        restaurantId: restaurantId || null,
    });

    return res.status(201).json({ message: "Coupon created", coupon });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Update coupon
// ─────────────────────────────────────────────────────────────────────────────
export const updateCoupon = async (req: Request, res: Response) => {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) throw new NotFoundException("Coupon not found");

    const {
        description, discountType, discountValue, minOrderValue,
        maxDiscountValue, usageLimit, perUserLimit, validFrom, validTo, active,
    } = req.body;

    if (description !== undefined) coupon.description = description;
    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = Number(discountValue);
    if (minOrderValue !== undefined) coupon.minOrderValue = Number(minOrderValue);
    if (maxDiscountValue !== undefined) coupon.maxDiscountValue = Number(maxDiscountValue);
    if (usageLimit !== undefined) coupon.usageLimit = Number(usageLimit);
    if (perUserLimit !== undefined) coupon.perUserLimit = Number(perUserLimit);
    if (validFrom !== undefined) coupon.validFrom = new Date(validFrom);
    if (validTo !== undefined) coupon.validTo = new Date(validTo);
    if (active !== undefined) coupon.active = active;

    await coupon.save();
    return res.json({ message: "Coupon updated", coupon });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Delete coupon
// ─────────────────────────────────────────────────────────────────────────────
export const deleteCoupon = async (req: Request, res: Response) => {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) throw new NotFoundException("Coupon not found");
    return res.json({ message: "Coupon deleted" });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get all coupons with usage stats
// ─────────────────────────────────────────────────────────────────────────────
export const getAllCoupons = async (_req: Request, res: Response) => {
    const coupons = await Coupon.find()
        .sort({ createdAt: -1 })
        .populate("restaurantId", "name slug");
    return res.json({ total: coupons.length, coupons });
};
