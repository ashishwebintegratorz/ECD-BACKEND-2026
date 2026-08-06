import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { checkOnboarding } from "../middlewares/checkOnboarding.middleware.js";
import {
  createOrder,
  verifyPayment,
  getMyOrders,
  getOrderById,
  cancelOrder,
  failOrder,
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
  getRestaurantOrders,
  restaurantMarkPreparing,
  restaurantVerifyPickup,
  sendPickupOtp,
  sendDeliveryOtp,
  calculateDeliveryFee,
  restaurantCompletePickup,
} from "../controllers/orders.controller.js";

import { validate } from "../middlewares/validate.middleware.js";
import { validateObjectId } from "../middlewares/validateObjectId.middleware.js";
import {
  createOrderSchema,
  verifyPaymentSchema,
  updateOrderStatusSchema,
  assignDriverSchema,
  cancelOrderSchema,
} from "../validators/order.validator.js";

const router = Router();

// ─── Customer ─────────────────────────────────────────────────────────────────
// Static routes FIRST to avoid conflict with /:orderId
router.post("/:orderId/cancel", jwtAuth, validateObjectId("orderId"), validate(cancelOrderSchema), asyncHandler(cancelOrder));
router.post("/:orderId/fail", jwtAuth, validateObjectId("orderId"), asyncHandler(failOrder));
router.get("/me", jwtAuth, asyncHandler(getMyOrders));
router.get("/my-orders", jwtAuth, asyncHandler(getMyOrders));
router.post("/create", jwtAuth, validate(createOrderSchema), asyncHandler(createOrder));
router.post("/calculate-fee", jwtAuth, asyncHandler(calculateDeliveryFee));
router.post("/verify-payment", jwtAuth, validate(verifyPaymentSchema), asyncHandler(verifyPayment));

router.get("/tracking/:orderId", jwtAuth, validateObjectId("orderId"), asyncHandler(getOrderTracking));

router.put("/cancel/:orderId", jwtAuth, validateObjectId("orderId"), validate(cancelOrderSchema), asyncHandler(cancelOrder));
router.get("/delivery-otp/:orderId", jwtAuth, validateObjectId("orderId"), asyncHandler(getDeliveryOtp));
// ─── Admin ────────────────────────────────────────────────────────────────────
router.get("/all", jwtAuth, requireRole("admin"), asyncHandler(getAllOrders));
router.put("/update-status/:orderId", jwtAuth, requireRole("admin"), validateObjectId("orderId"), validate(updateOrderStatusSchema), asyncHandler(updateOrderStatus));
router.put("/assign-driver/:orderId", jwtAuth, requireRole("admin"), validateObjectId("orderId"), validate(assignDriverSchema), asyncHandler(assignOrderToDriver));

// ─── Restaurant ───────────────────────────────────────────────────────────────
router.get("/restaurant/:restaurantId", jwtAuth, requireRole("restaurant", "admin"), validateObjectId("restaurantId"), asyncHandler(getRestaurantOrders));
router.patch("/restaurant/prepare/:orderId", jwtAuth, requireRole("restaurant", "admin"), validateObjectId("orderId"), asyncHandler(restaurantMarkPreparing));
router.patch("/restaurant/ready/:orderId", jwtAuth, requireRole("restaurant", "admin"), validateObjectId("orderId"), asyncHandler(restaurantMarkReady));
router.post("/restaurant/verify-pickup/:orderId", jwtAuth, requireRole("restaurant", "admin"), validateObjectId("orderId"), asyncHandler(restaurantVerifyPickup));
router.patch("/restaurant/cancel/:orderId", jwtAuth, requireRole("restaurant", "admin"), validateObjectId("orderId"), asyncHandler(restaurantCancelOrder));
router.post("/restaurant/send-pickup-otp/:orderId", jwtAuth, requireRole("restaurant", "admin"), validateObjectId("orderId"), asyncHandler(sendPickupOtp));
router.post("/restaurant/complete-pickup/:orderId", jwtAuth, requireRole("restaurant", "admin"), validateObjectId("orderId"), asyncHandler(restaurantCompletePickup));

// ─── Driver ───────────────────────────────────────────────────────────────────
router.get("/driver/my-orders", jwtAuth, requireRole("driver"), checkOnboarding, asyncHandler(getDriverOrders));
router.post("/driver/send-pickup-otp/:orderId", jwtAuth, requireRole("driver"), validateObjectId("orderId"), asyncHandler(sendPickupOtp));
router.post("/driver/send-delivery-otp/:orderId", jwtAuth, requireRole("driver"), validateObjectId("orderId"), asyncHandler(sendDeliveryOtp));
router.patch("/driver/accept/:orderId", jwtAuth, requireRole("driver"), validateObjectId("orderId"), asyncHandler(driverAcceptOrder));
router.patch("/driver/decline/:orderId", jwtAuth, requireRole("driver"), checkOnboarding, validateObjectId("orderId"), asyncHandler(driverDeclineOrder));
router.put("/driver/update-status/:orderId", jwtAuth, requireRole("driver"), checkOnboarding, validateObjectId("orderId"), asyncHandler(updateOrderByDriver));

// ─── Admin: Cancellation Tracking ────────────────────────────────────────────
router.get("/cancellations/all", jwtAuth, requireRole("admin"), asyncHandler(getAllCancellations));
router.get("/cancellations/stats", jwtAuth, requireRole("admin"), asyncHandler(getCancellationStats));
router.get("/cancellations/restaurant/:restaurantId", jwtAuth, requireRole("admin"), validateObjectId("restaurantId"), asyncHandler(getRestaurantCancellations));

// ─── Catch-all Generic Routes ────────────────────────────────────────────────
router.get("/:orderId", jwtAuth, validateObjectId("orderId"), asyncHandler(getOrderById));

export default router;
