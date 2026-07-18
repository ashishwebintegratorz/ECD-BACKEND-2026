import { Router } from "express";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
    getAllDrivers,
    getFreeDrivers,
    toggleOnlineStatus,
    markReachedStoreStatus,
    updateDriverLocation,
    getAllDriverLocations,
    getDriverProfile,
    updateDriverProfile,
    logoutDriver,
} from "../controllers/driver.controller.js";
import { getDriverSummary, getMonthlyPerformance } from "../controllers/driverPerformance.controller.js";
import { 
    getActiveOrder, 
    getOrderHistory, 
    confirmPaymentReceipt,
    completeDeliveryWithOTP
} from "../controllers/driverOrder.controller.js";
import { 
    getWalletSummary, 
    requestWithdrawal 
} from "../controllers/driverWallet.controller.js";
import {
    getCodBalance,
    initiateCodPayment,
    verifyCodPayment
} from "../controllers/driverCod.controller.js";
import { upload } from "../middlewares/multer.js";
import { checkOnboarding } from "../middlewares/checkOnboarding.middleware.js";

const router = Router();

// Admin Routes
router.get("/all", jwtAuth, requireRole("admin"), getAllDrivers);
router.get("/free", jwtAuth, requireRole("admin"), getFreeDrivers);
router.get("/locations", jwtAuth, requireRole("admin"), getAllDriverLocations);

// Driver Routes
router.put("/toggle-online", jwtAuth, requireRole("driver"), toggleOnlineStatus);
router.put("/reached-store", jwtAuth, requireRole("driver"), markReachedStoreStatus);
router.put("/update-location", jwtAuth, requireRole("driver"), updateDriverLocation);
router.get("/profile", jwtAuth, requireRole("driver"), getDriverProfile);
router.post("/documents", jwtAuth, requireRole("driver"), upload.fields([
    { name: "aadhar_front", maxCount: 1 },
    { name: "aadhar_back", maxCount: 1 },
    { name: "license", maxCount: 1 },
    { name: "profile_image", maxCount: 1 }
]), updateDriverProfile);
router.post("/logout", jwtAuth, requireRole("driver"), logoutDriver);
router.get("/summary", jwtAuth, requireRole("driver"), getDriverSummary);
router.get("/performance/monthly", jwtAuth, requireRole("driver"), getMonthlyPerformance);

// Order Management
router.get("/orders/active", jwtAuth, requireRole("driver"), getActiveOrder);
router.get("/orders/history", jwtAuth, requireRole("driver"), getOrderHistory);
router.patch("/orders/confirm-payment", jwtAuth, requireRole("driver"), checkOnboarding, confirmPaymentReceipt);
router.post("/orders/complete", jwtAuth, requireRole("driver"), checkOnboarding, completeDeliveryWithOTP);

// Wallet & Withdrawals
router.get("/wallet", jwtAuth, requireRole("driver"), getWalletSummary);
router.post("/withdraw", jwtAuth, requireRole("driver"), checkOnboarding, requestWithdrawal);

// COD Settlements
router.get("/cod-balance", jwtAuth, requireRole("driver"), getCodBalance);
router.post("/cod-payment/initiate", jwtAuth, requireRole("driver"), checkOnboarding, initiateCodPayment);
router.post("/cod-payment/verify", jwtAuth, requireRole("driver"), checkOnboarding, verifyCodPayment);

export default router;
