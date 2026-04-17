import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js"; // user auth
//import { authDriver } from "../middlewares/driverAuth.middleware.js"; // if you separate drivers
import {
  createOrder, verifyPayment, getMyOrders, getOrderById, cancelOrder, updateOrderStatus, getAllOrders,
  assignOrderToDriver, getDriverOrders, updateOrderByDriver,
  restaurantConfirmOrder, restaurantMarkReady, driverAcceptOrder,
} from "../controllers/orders.controller.js";
import { requireRole } from "../middlewares/role.middleware.js";
const router = Router();

// 🟢 Create Order

router.post(
  "/create",
  jwtAuth,
  asyncHandler(createOrder)
);
router.post(
  "/verify-payment",
  jwtAuth,
  asyncHandler(verifyPayment)
);


router.get(
  "/my-orders",
  jwtAuth,
  asyncHandler(getMyOrders)
);
router.get(
  "/all",
  jwtAuth,
  requireRole("admin"),
  asyncHandler(getAllOrders)
);
router.get(
  "/:orderId",
  jwtAuth,
  asyncHandler(getOrderById)
);

router.put(
  "/cancel/:orderId",
  jwtAuth,
  asyncHandler(cancelOrder)
);

router.put(
  "/update-status/:orderId",
  jwtAuth,
  requireRole("admin"),
  asyncHandler(updateOrderStatus)
);



// --- Driver & Admin Assignment Routes ---

// Admin: Assign driver to order
router.put(
  "/assign-driver/:orderId",
  jwtAuth,
  requireRole("admin"),
  asyncHandler(assignOrderToDriver)
);

// Driver: Get my orders
router.get(
  "/driver/my-orders",
  jwtAuth,
  requireRole("driver"),
  asyncHandler(getDriverOrders)
);

// Driver: Update order status
router.put(
  "/driver/update-status/:orderId",
  jwtAuth,
  requireRole("driver"),
  asyncHandler(updateOrderByDriver)
);

// ─── Restaurant Flow ──────────────────────────────────────────────────────────

// Restaurant: Confirm order (start preparing)
router.patch(
  "/restaurant/confirm/:orderId",
  jwtAuth,
  requireRole("admin"),
  asyncHandler(restaurantConfirmOrder)
);

// Restaurant: Mark order ready for pickup
router.patch(
  "/restaurant/ready/:orderId",
  jwtAuth,
  requireRole("admin"),
  asyncHandler(restaurantMarkReady)
);

// ─── Driver Acceptance ────────────────────────────────────────────────────────

// Driver: Accept assigned order
router.patch(
  "/driver/accept/:orderId",
  jwtAuth,
  requireRole("driver"),
  asyncHandler(driverAcceptOrder)
);

export default router;