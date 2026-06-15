import { Router } from "express";
import {
  getAllBanners,
  getActiveBanners,
  addBanner,
  deleteBanner,
  toggleBannerStatus,
} from "../controllers/banner.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

const router = Router();

// Public route to get active banners
router.get("/", asyncHandler(getActiveBanners));

// Admin routes
router.get(
  "/admin",
  jwtAuth,
  requireRole("admin"),
  asyncHandler(getAllBanners)
);

router.post(
  "/",
  jwtAuth,
  requireRole("admin"),
  asyncHandler(addBanner)
);

router.delete(
  "/:id",
  jwtAuth,
  requireRole("admin"),
  asyncHandler(deleteBanner)
);

router.patch(
  "/:id/toggle",
  jwtAuth,
  requireRole("admin"),
  asyncHandler(toggleBannerStatus)
);

export default router;
