import { Router } from "express";
import {
  getAllPopularDishes,
  addPopularDish,
  updatePopularDish,
  deletePopularDish,
} from "../controllers/popularDish.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { upload } from "../middlewares/multer.js";

const router = Router();

// Public route to get popular dishes for home page
router.get("/", asyncHandler(getAllPopularDishes));

// Admin only routes for managing popular dishes
router.post(
  "/",
  asyncHandler(jwtAuth),
  requireRole("admin"),
  upload.single("image"),
  asyncHandler(addPopularDish)
);

router.put(
  "/:id",
  asyncHandler(jwtAuth),
  requireRole("admin"),
  upload.single("image"),
  asyncHandler(updatePopularDish)
);

router.delete(
  "/:id",
  asyncHandler(jwtAuth),
  requireRole("admin"),
  asyncHandler(deletePopularDish)
);

export default router;
