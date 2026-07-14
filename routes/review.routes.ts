import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
  createReview,
  getAllReviews,
  getMyReviews,
  deleteMyReview,
  hideReview,
  deleteReview,
  addRestaurantReview,
  getRestaurantReviews,
} from "../controllers/review.controller.js";

const router = Router();

//User Routes
router.post("/", jwtAuth, asyncHandler(createReview));
router.get("/my", jwtAuth, asyncHandler(getMyReviews));
router.delete("/:reviewId", jwtAuth, asyncHandler(deleteMyReview));

router.post("/restaurant", jwtAuth, asyncHandler(addRestaurantReview));
router.get("/restaurant/:restaurantId", asyncHandler(getRestaurantReviews));

//Admin Routes
router.get("/all", jwtAuth, requireRole("admin"), asyncHandler(getAllReviews));
router.put("/hide/:reviewId", jwtAuth, requireRole("admin"), asyncHandler(hideReview));
router.delete("/admin/:reviewId", jwtAuth, requireRole("admin"), asyncHandler(deleteReview));

export default router;