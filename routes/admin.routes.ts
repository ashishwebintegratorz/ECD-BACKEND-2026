import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
    getDashboard,
    getAllUsers,
    getUserById,
    updateUserRole,
    toggleUserBlock,
    getRevenueStats,
    getStoreStats,
    getLiveOrders,
} from "../controllers/admin.controller.js";

const router = Router();

router.use(jwtAuth, requireRole("admin"));

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get("/dashboard", asyncHandler(getDashboard));
router.get("/live-orders", asyncHandler(getLiveOrders));

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats/revenue", asyncHandler(getRevenueStats));
router.get("/stats/stores", asyncHandler(getStoreStats));

// ─── User Management ─────────────────────────────────────────────────────────
router.get("/users", asyncHandler(getAllUsers));
router.get("/users/:id", asyncHandler(getUserById));
router.patch("/users/:id/role", asyncHandler(updateUserRole));
router.patch("/users/:id/block", asyncHandler(toggleUserBlock));

export default router;
