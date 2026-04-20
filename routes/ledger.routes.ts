import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
    getLedgerEntries,
    getLedgerSummary,
    getPayoutBatches,
    getDriverDashboard,
    getRestaurantDashboard,
} from "../controllers/ledger.controller.js";

const router = Router();

// ─── Driver: own earnings dashboard ──────────────────────────────────────────
// GET /api/v1/ledger/driver/dashboard
router.get(
    "/driver/dashboard",
    jwtAuth,
    requireRole("driver"),
    asyncHandler(getDriverDashboard)
);

// ─── Admin: restaurant earnings dashboard ────────────────────────────────────
// GET /api/v1/ledger/restaurant/dashboard?restaurantId=
router.get(
    "/restaurant/dashboard",
    jwtAuth,
    requireRole("admin"),
    asyncHandler(getRestaurantDashboard)
);

// ─── Admin only ───────────────────────────────────────────────────────────────
// GET /api/v1/ledger?party=restaurant&status=pending&from=&to=
router.get("/", jwtAuth, requireRole("admin"), asyncHandler(getLedgerEntries));
router.get("/summary", jwtAuth, requireRole("admin"), asyncHandler(getLedgerSummary));
router.get("/batches", jwtAuth, requireRole("admin"), asyncHandler(getPayoutBatches));

export default router;
