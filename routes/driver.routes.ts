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
} from "../controllers/driver.controller.js";

const router = Router();

// Admin Routes
router.get("/all", jwtAuth, requireRole("admin"), getAllDrivers);
router.get("/free", jwtAuth, requireRole("admin"), getFreeDrivers);
router.get("/locations", jwtAuth, requireRole("admin"), getAllDriverLocations);

// Driver Routes
router.put("/toggle-online", jwtAuth, requireRole("driver"), toggleOnlineStatus);
router.put("/reached-store", jwtAuth, requireRole("driver"), markReachedStoreStatus);
router.put("/update-location", jwtAuth, requireRole("driver"), updateDriverLocation);

export default router;
