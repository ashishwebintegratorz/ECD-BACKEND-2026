import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
  createOrder,
  verifyPayment,
  getMyOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
  getAllOrders,
  assignOrderToDriver,
  getDriverOrders,
  updateOrderByDriver,
  restaurantMarkReady,
  restaurantCancelOrder,
  driverAcceptOrder,
  driverDeclineOrder,
  getAllCancellations,
  getRestaurantCancellations,
  getCancellationStats,
  getDeliveryOtp,
  getOrderTracking,
} from "../controllers/orders.controller.js";

const router = Router();

// ─── Customer ─────────────────────────────────────────────────────────────────
// Static routes FIRST to avoid conflict with /:orderId
router.get("/me", jwtAuth, asyncHandler(getMyOrders));
router.get("/my-orders", jwtAuth, asyncHandler(getMyOrders));
router.post("/create", jwtAuth, asyncHandler(createOrder));
router.post("/verify-payment", jwtAuth, asyncHandler(verifyPayment));

router.get("/tracking/:orderId", jwtAuth, asyncHandler(getOrderTracking));

router.put("/cancel/:orderId", jwtAuth, asyncHandler(cancelOrder));
router.get("/delivery-otp/:orderId", jwtAuth, asyncHandler(getDeliveryOtp));
// ─── Admin ────────────────────────────────────────────────────────────────────
router.get("/all", jwtAuth, requireRole("admin"), asyncHandler(getAllOrders));
router.put("/update-status/:orderId", jwtAuth, requireRole("admin"), asyncHandler(updateOrderStatus));
router.put("/assign-driver/:orderId", jwtAuth, requireRole("admin"), asyncHandler(assignOrderToDriver));

// ─── Restaurant ───────────────────────────────────────────────────────────────
router.patch("/restaurant/ready/:orderId", jwtAuth, requireRole("admin"), asyncHandler(restaurantMarkReady));
router.patch("/restaurant/cancel/:orderId", jwtAuth, requireRole("admin"), asyncHandler(restaurantCancelOrder));

// ─── Driver ───────────────────────────────────────────────────────────────────
router.get("/driver/my-orders", jwtAuth, requireRole("driver"), asyncHandler(getDriverOrders));
router.patch("/driver/accept/:orderId", jwtAuth, requireRole("driver"), asyncHandler(driverAcceptOrder));
router.patch("/driver/decline/:orderId", jwtAuth, requireRole("driver"), asyncHandler(driverDeclineOrder));
router.put("/driver/update-status/:orderId", jwtAuth, requireRole("driver"), asyncHandler(updateOrderByDriver));

// ─── Admin: Cancellation Tracking ────────────────────────────────────────────
router.get("/cancellations/all", jwtAuth, requireRole("admin"), asyncHandler(getAllCancellations));
router.get("/cancellations/stats", jwtAuth, requireRole("admin"), asyncHandler(getCancellationStats));
router.get("/cancellations/restaurant/:restaurantId", jwtAuth, requireRole("admin"), asyncHandler(getRestaurantCancellations));

// ─── Catch-all Generic Routes ────────────────────────────────────────────────
router.get("/:orderId", jwtAuth, asyncHandler(getOrderById));

export default router;
