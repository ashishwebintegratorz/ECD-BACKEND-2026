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
    updateUserDetails,
    getRestaurantPayouts,
    processRestaurantPayout,
    getRiderOrdersSummary,
    getRiderOrderHistory,
    getSuspendedAccounts,
    deleteRestaurant,
    getCustomerSummary,
    getCustomerOrderHistory
} from "../controllers/admin.controller.js";
import { getAllWithdrawalRequests, processWithdrawal } from "../controllers/driverWallet.controller.js";

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
router.patch("/users/:id/details", asyncHandler(updateUserDetails));
router.get("/suspended-accounts", asyncHandler(getSuspendedAccounts));
router.get("/customers/summary", asyncHandler(getCustomerSummary));
router.get("/customers/:id/order-history", asyncHandler(getCustomerOrderHistory));

// ─── Rider Payouts & Orders ──────────────────────────────────────────────────
router.get("/withdrawals", asyncHandler(getAllWithdrawalRequests));
router.patch("/withdrawals/process", asyncHandler(processWithdrawal));
router.get("/riders/orders/summary", asyncHandler(getRiderOrdersSummary));
router.get("/riders/:id/order-history", asyncHandler(getRiderOrderHistory));

// ─── Restaurant Payouts & Management ──────────────────────────────────────────────────────
router.get("/restaurants/payouts", asyncHandler(getRestaurantPayouts));
router.patch("/restaurants/payouts/process", asyncHandler(processRestaurantPayout));
router.delete("/restaurants/:id", asyncHandler(deleteRestaurant));

export default router;
