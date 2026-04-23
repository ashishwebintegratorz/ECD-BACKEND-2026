import Coupon from "../models/Coupon.model.js";
import Order from "../models/Order.model.js";

interface ValidateResult {
    ok: boolean;
    message?: string;
    discountAmount?: number;
    couponId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate a coupon code before applying it to an order
// ─────────────────────────────────────────────────────────────────────────────
export const validateCoupon = async (
    code: string,
    userId: string,
    storeId: string,
    orderAmount: number
): Promise<ValidateResult> => {
    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });

    if (!coupon || !coupon.active)
        return { ok: false, message: "Coupon not found or inactive" };

    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now)
        return { ok: false, message: "Coupon is not yet valid" };

    if (coupon.validTo && coupon.validTo < now)
        return { ok: false, message: "Coupon has expired" };

    if (coupon.minOrderValue && orderAmount < coupon.minOrderValue)
        return { ok: false, message: `Minimum order value for this coupon is ₹${coupon.minOrderValue}` };

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit)
        return { ok: false, message: "Coupon usage limit reached" };

    // Restaurant-specific coupon check
    if (coupon.restaurantId && coupon.restaurantId.toString() !== storeId)
        return { ok: false, message: "This coupon is not valid for this store" };

    // Per-user limit check
    if (coupon.perUserLimit) {
        const userUsageCount = await Order.countDocuments({
            customer: userId,
            "coupon.couponId": coupon._id,
        });
        if (userUsageCount >= coupon.perUserLimit)
            return { ok: false, message: `You have already used this coupon ${coupon.perUserLimit} time(s)` };
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === "percent") {
        discountAmount = Math.round((orderAmount * coupon.discountValue) / 100);
        if (coupon.maxDiscountValue) {
            discountAmount = Math.min(discountAmount, coupon.maxDiscountValue);
        }
    } else {
        discountAmount = coupon.discountValue;
    }

    // Discount cannot exceed order amount
    discountAmount = Math.min(discountAmount, orderAmount);

    return { ok: true, discountAmount, couponId: coupon._id.toString() };
};

// ─────────────────────────────────────────────────────────────────────────────
// Increment usedCount after order is placed
// ─────────────────────────────────────────────────────────────────────────────
export const incrementCouponUsage = async (couponId: string) => {
    await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } });
};
