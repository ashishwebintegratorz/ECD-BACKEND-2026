import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
    getMyRefunds,
    getAllRefunds,
    getRefundStats,
} from "../controllers/refund.controller.js";

const router = Router();

// Customer: view my refunds
router.get("/my", jwtAuth, asyncHandler(getMyRefunds));

// Admin: view all refunds + stats
router.get("/all", jwtAuth, requireRole("admin"), asyncHandler(getAllRefunds));
router.get("/stats", jwtAuth, requireRole("admin"), asyncHandler(getRefundStats));

export default router;
