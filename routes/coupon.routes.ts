import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
    validateCouponEndpoint,
    getActiveCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    getAllCoupons,
} from "../controllers/coupon.controller.js";

const router = Router();

// ─── Customer ─────────────────────────────────────────────────────────────────
router.post("/validate", jwtAuth, asyncHandler(validateCouponEndpoint));
router.get("/active", jwtAuth, asyncHandler(getActiveCoupons));

// ─── Admin ────────────────────────────────────────────────────────────────────
router.get("/admin/all", jwtAuth, requireRole("admin"), asyncHandler(getAllCoupons));
router.post("/admin/create", jwtAuth, requireRole("admin"), asyncHandler(createCoupon));
router.put("/admin/update/:id", jwtAuth, requireRole("admin"), asyncHandler(updateCoupon));
router.delete("/admin/delete/:id", jwtAuth, requireRole("admin"), asyncHandler(deleteCoupon));

export default router;
