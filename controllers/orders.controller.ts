import Order from "../models/Order.model.js";
import Cart from "../models/Cart.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import { razorpay } from "../config/razorpay.config.js";
import crypto from "crypto";
import { Request, Response } from "express";
import { confirmOrderLogic, updateDriverLedgerRef, validateCartStock } from "../services/order.service.js";
import { createRefundRecord } from "../services/refund.service.js";
import { validateCoupon, incrementCouponUsage } from "../services/coupon.service.js";
import {
  notifyOrderPlaced,
  notifyOrderReady,
  notifyDriverAssigned,
  notifyDriverAccepted,
  notifyOutForDelivery,
  notifyOrderDelivered,
  notifyOrderCancelled,
  notifyRefundInitiated,
} from "../services/notification.service.js";
import User from "../models/User.model.js";
import {
  emitOrderStatusUpdate,
  emitNewOrderToRestaurant,
  emitOrderAssignedToDriver,
  emitDriverLocation,
} from "../socket/orderSocket.js";
import { startAssignmentFlow, assignToNearestDriver } from "../services/assignment.service.js";
import { updatePerformanceOnDelivery } from "../services/driverPerformance.service.js";
import Address from "../models/Address.model.js";
import { calculateDeliveryCharge, isWithinIndore, haversineDistance } from "../utils/delivery.utils.js";
import Restaurant from "../models/Restaurant.model.js";
import DriverLocation from "../models/DriverLocation.model.js";
import DeliverySetting from "../models/DeliverySetting.model.js";
import { sendPickupOtpSms, sendDeliveryOtpSms } from "../services/otp.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generate a 4-digit numeric OTP
// ─────────────────────────────────────────────────────────────────────────────
const generateDeliveryOtp = (): string =>
  String(Math.floor(1000 + Math.random() * 9000));

// ─────────────────────────────────────────────────────────────────────────────
// Helper: log a cancellation entry onto the order itself
// ─────────────────────────────────────────────────────────────────────────────
const logCancellation = (
  order: any,
  cancelledBy: string,
  cancelledByUser: string,
  reason: string
) => {
  order.cancellationLog.push({
    cancelledBy,
    cancelledByUser,
    reason,
    cancelledAt: new Date(),
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: Create Order
// ─────────────────────────────────────────────────────────────────────────────
export const createOrder = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { addressId, paymentMethod, restaurantId, couponCode, address: rawAddress, deliveryPhone, orderType, pickupTime } = req.body;

  // Require real restaurant ID
  if (!restaurantId) {
    return res.status(400).json({ message: "Restaurant ID is required" });
  }

  let addressDoc;
  if (addressId) {
    try {
      addressDoc = await Address.findOne({ _id: addressId, user: userId });
    } catch (e) {
      return res.status(400).json({ message: "Invalid Address ID format" });
    }
  } else if (rawAddress) {
    // Use raw address object sent from frontend (e.g., current location)
    addressDoc = rawAddress;
  }

  if (!addressDoc && orderType !== "pickup") {
    return res.status(400).json({ message: "Address or Address ID is required for delivery" });
  }

  if (orderType !== "pickup") {
    const { location } = addressDoc;
    if (!location?.coordinates || location.coordinates.length < 2)
      return res.status(400).json({ message: "Location coordinates are required" });

    const [lng, lat] = location.coordinates;
    if (!isWithinIndore(lat, lng))
      return res.status(400).json({ message: "Delivery is only available in Indore" });
  }

  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0)
    return res.status(400).json({ message: "Cart empty" });

  // ── Stock validation (works for both restaurant and grocery) ──────────────
  // Bypassing stock check for development testing
  /*
  const stockCheck = await validateCartStock(cart.items);
  if (!stockCheck.ok)
    return res.status(400).json({ message: stockCheck.message });
  */

  let addressSnapshot;
  if (orderType === "pickup") {
    addressSnapshot = {
      fullAddress: "Self-Pickup",
      location: { type: "Point", coordinates: [0, 0] },
      phone: deliveryPhone || (req as any).user.phone || "",
    };
  } else {
    addressSnapshot = {
      fullAddress: addressDoc.fullAddress,
      apartment: addressDoc.apartment,
      landmark: addressDoc.landmark,
      location: addressDoc.location,
      phone: addressDoc.phone,
    };
  }

  const totalAmount = cart.items.reduce((s, i) => s + i.priceAtAdd * i.qty, 0);
  if (totalAmount < 100)
    return res.status(400).json({ message: "Minimum order amount is ₹100" });

  // Will calculate dynamic delivery charge below
  // ── Fetch store to check type (Restaurant/Grocery) for GST ───────────────
  const store = await Restaurant.findById(restaurantId);
  const isRestaurant = store?.storeType === "restaurant";

  // ── Coupon validation ─────────────────────────────────────────────────────
  let totalDiscount = 0;
  let appliedCoupon: { couponId: string; code: string; discountAmount: number } | undefined;
  
  if (couponCode) {
    const couponResult = await validateCoupon(couponCode, userId, restaurantId, totalAmount);
    if (!couponResult.ok)
      return res.status(400).json({ message: couponResult.message });
    
    totalDiscount = couponResult.discountAmount!;
    appliedCoupon = {
      couponId: couponResult.couponId!,
      code: couponCode.toUpperCase().trim(),
      discountAmount: totalDiscount,
    };
  }

  // ── Dynamic Delivery Fee Calculations ─────────────────────────────────────
  let driverEarnings = 0;
  let adminCommission = 0;
  let deliveryCharge = 0;

  if (store && addressDoc?.location?.coordinates && store.location?.coordinates) {
    const [custLng, custLat] = addressDoc.location.coordinates;
    const [storeLng, storeLat] = store.location.coordinates;
    
    // Calculate distance
    const distanceKm = haversineDistance(storeLat, storeLng, custLat, custLng);
    
    // Fetch settings
    const settings = await DeliverySetting.findOne();
    const currentHour = new Date().getHours();
    const isNightShift = currentHour >= 22 || currentHour < 6; // 10 PM to 6 AM
    
    const activeShift = settings 
        ? (isNightShift ? settings.nightShift : settings.morningShift)
        : { riderFeePerKm: 10, adminCommissionPerKm: 2 }; // Fallback

    if (orderType === "pickup") {
      driverEarnings = 0;
      adminCommission = 0;
      deliveryCharge = 0;
    } else {
      driverEarnings = Math.max(15, Math.ceil(distanceKm * activeShift.riderFeePerKm));
      adminCommission = Math.ceil(distanceKm * activeShift.adminCommissionPerKm);
      // Total delivery charge shown to user is Rider Fee + Admin Commission
      deliveryCharge = driverEarnings + adminCommission;
    }
  }

  // ── GST Calculation (5% for Restaurants) ──────────────────────────────────
  const taxableAmount = Math.max(0, totalAmount - totalDiscount);
  const gst = isRestaurant ? Math.round(taxableAmount * 0.05) : 0;
  const payableAmount = taxableAmount + deliveryCharge + gst;

  // Calculate 50% deal for the restaurant on the food price
  const restaurantEarnings = Math.round(taxableAmount * 0.50);

  console.log("Creating Order with data:", JSON.stringify({
    orderNumber: `ORD-${Date.now()}`,
    customer: userId,
    store: restaurantId,
    itemsCount: cart.items.length,
    totalAmount,
    payableAmount,
    driverEarnings,
    restaurantEarnings,
    riderAdminCommission: adminCommission,
    addressSnapshot
  }, null, 2));

  let order;
  try {
    order = await Order.create({
      orderNumber: `ORD-${Date.now()}`,
      customer: userId,
      store: restaurantId,   // generic store ref (restaurant or grocery)
      items: cart.items.map((i) => ({
        product: i.product,
        name: i.name || "Item",
        variantIndex: i.variantIndex || 0,
        qty: i.qty,
        price: i.priceAtAdd,
        subtotal: i.priceAtAdd * i.qty,
      })),
      totalAmount,
      deliveryCharge,
      gst,
      totalDiscount,
      payableAmount,
      address: addressSnapshot,
      status: "pending",
      deliveryStatus: orderType === "pickup" ? "self_pickup" : "pending",
      deliveryPhone,
      orderType: orderType === "pickup" ? "pickup" : "delivery",
      pickupTime: orderType === "pickup" ? pickupTime : undefined,
      driverEarnings,
      restaurantEarnings,
      riderAdminCommission: adminCommission,
      ...(appliedCoupon && { coupon: appliedCoupon }),
    });
  } catch (err: any) {
    console.error("ORDER CREATE ERROR:", err);
    return res.status(400).json({ 
      message: "Order validation failed", 
      error: err.message,
      details: err.errors 
    });
  }

  // COD flow
  if (paymentMethod === "cod") {
    const txn = await PaymentTransaction.create({
      order: order._id,
      provider: "cod",
      amount: payableAmount,
      status: "success",
    });
    order.paymentTransaction = txn._id;
    await order.save();
    
    await confirmOrderLogic(order._id.toString());

    // Auto-generate delivery OTP for order
    const deliveryOtp = generateDeliveryOtp();
    await Order.findByIdAndUpdate(order._id, { deliveryOTP: deliveryOtp });

    const updatedOrder = await Order.findById(order._id);
    // Push: order placed
    notifyOrderPlaced(userId, order.orderNumber).catch(() => { });
    return res.json({ 
      order: updatedOrder, 
      cod: true,
      summary: {
        totalAmount,
        deliveryCharge,
        gst,
        totalDiscount,
        payableAmount
      }
    });
  }

  // If frontend already processed mock payment and sent a paymentId
  if (req.body.paymentId) {
    const txn = await PaymentTransaction.create({
      order: order._id,
      provider: paymentMethod || "mock",
      providerPaymentId: req.body.paymentId,
      amount: payableAmount,
      status: "success",
    });
    order.paymentTransaction = txn._id;
    await order.save();
    
    await confirmOrderLogic(order._id.toString());

    // Auto-generate delivery OTP for order
    const deliveryOtp = generateDeliveryOtp();
    await Order.findByIdAndUpdate(order._id, { deliveryOTP: deliveryOtp });

    const updatedOrder = await Order.findById(order._id);
    notifyOrderPlaced(userId, order.orderNumber).catch(() => { });
    
    return res.json({
      order: updatedOrder,
      mockPayment: true,
      summary: {
        totalAmount,
        deliveryCharge,
        gst,
        totalDiscount,
        payableAmount
      }
    });
  }

  // Real Razorpay flow
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(payableAmount * 100),
    currency: "INR",
    receipt: order.orderNumber,
    payment_capture: true,
  });

  console.log("RAZORPAY ORDER CREATED (Order Flow):", JSON.stringify(razorpayOrder, null, 2));

  const txn = await PaymentTransaction.create({
    order: order._id,
    provider: "razorpay",
    providerPaymentId: razorpayOrder.id,
    amount: payableAmount,
    status: "initiated",
  });
  order.paymentTransaction = txn._id;
  await order.save();

  return res.json({
    orderId: order._id,
    razorpayOrderId: razorpayOrder.id,
    amount: payableAmount,
    deliveryCharge,
    gst,
    totalDiscount,
    currency: "INR",
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: Calculate Delivery Fee (Dynamic Pricing)
// ─────────────────────────────────────────────────────────────────────────────
export const calculateDeliveryFee = async (req: Request, res: Response) => {
  const { restaurantId, lat, lng } = req.body;

  if (!restaurantId || !lat || !lng) {
    return res.status(400).json({ message: "restaurantId, lat, and lng are required" });
  }

  const store = await Restaurant.findById(restaurantId);
  if (!store || !store.location?.coordinates) {
    return res.status(400).json({ message: "Invalid restaurant or location missing" });
  }

  const [storeLng, storeLat] = store.location.coordinates;
  const distanceKm = haversineDistance(storeLat, storeLng, parseFloat(lat), parseFloat(lng));

  const settings = await DeliverySetting.findOne();
  const currentHour = new Date().getHours();
  const isNightShift = currentHour >= 22 || currentHour < 6; // 10 PM to 6 AM

  const activeShift = settings
    ? (isNightShift ? settings.nightShift : settings.morningShift)
    : { riderFeePerKm: 10, adminCommissionPerKm: 2 };

  const driverEarnings = Math.max(15, Math.ceil(distanceKm * activeShift.riderFeePerKm));
  const adminCommission = Math.ceil(distanceKm * activeShift.adminCommissionPerKm);
  const deliveryCharge = driverEarnings + adminCommission;

  return res.json({
    success: true,
    distanceKm: distanceKm.toFixed(2),
    deliveryCharge,
    driverEarnings,
    adminCommission,
    isCodEnabled: settings?.isCodEnabled ?? true,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: Verify Razorpay Payment
// ─────────────────────────────────────────────────────────────────────────────
export const verifyPayment = async (req: Request, res: Response) => {
  console.log("=========== VERIFY API HIT ===========");
  console.log("REQUEST BODY:", JSON.stringify(req.body, null, 2));

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  console.log("EXPECTED SIGNATURE:", expectedSignature);
  console.log("RECEIVED SIGNATURE:", razorpay_signature);

  if (expectedSignature !== razorpay_signature) {
    console.error("SIGNATURE MISMATCH!");
    return res.status(400).json({ message: "Invalid payment signature" });
  }

  const transaction = await PaymentTransaction.findOne({ providerPaymentId: razorpay_order_id });
  if (!transaction)
    return res.status(404).json({ message: "Transaction not found" });

  transaction.status = "success";
  transaction.meta = { razorpay_payment_id };
  await transaction.save();

  await confirmOrderLogic(transaction.order.toString());

  // Auto-generate delivery OTP for order after Razorpay payment
  const confirmedOrder = await Order.findById(transaction.order);
  if (confirmedOrder) {
    const deliveryOtp = generateDeliveryOtp();
    await Order.findByIdAndUpdate(confirmedOrder._id, { deliveryOTP: deliveryOtp });
  }

  return res.json({ success: true });
};



// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: Mark Order Ready → admin assigns rider
// ─────────────────────────────────────────────────────────────────────────────
export const restaurantMarkReady = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.status !== "preparing" && order.status !== "ready")
    return res.status(400).json({ message: "Order must be in preparing or ready state" });

  order.status = "ready";
  order.readyAt = new Date();
  order.rejectedDrivers = []; // Clear previous rejections on manual retry!
  if (!order.pickupOtp) order.pickupOtp = generateDeliveryOtp(); // Reuse the same 4-digit helper
  await order.save();

  // Push: order ready
  notifyOrderReady(order.customer.toString(), order.orderNumber).catch(() => { });

  let message = "Order marked as ready. Assigning nearest rider...";
  let assigned: any = false;

  if (order.orderType === "pickup") {
    message = "Order marked as ready for self-pickup.";
    emitOrderStatusUpdate(orderId, {
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      message: "Your order is ready for pickup. Please collect it from the restaurant.",
      updatedAt: (order as any).updatedAt,
    });
  } else {
    emitOrderStatusUpdate(orderId, {
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      message: "Your order is ready. A rider will be assigned shortly.",
      updatedAt: (order as any).updatedAt,
    });

    // Auto-assign to nearest available driver
    assigned = await assignToNearestDriver(orderId).catch(err => {
      console.error(`[Auto-Assign] Failed to auto assign order ${orderId}:`, err);
      return false;
    });

    if (assigned === false) {
      return res.json({ 
          message: "Rider is offline or none available. Not showing rider.", 
          driverNotFound: true, 
          order 
      });
    }
  }

  return res.json({ message, order });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: Cancel Order (only while preparing, mandatory reason)
// ─────────────────────────────────────────────────────────────────────────────
export const restaurantCancelOrder = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;
  const { reason } = req.body;

  if (!reason || reason.trim().length < 5)
    return res.status(400).json({ message: "Cancellation reason is required (min 5 characters)" });

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (!["pending", "preparing", "ready"].includes(order.status))
    return res.status(400).json({ message: "Order can only be cancelled while pending, preparing, or ready (before rider pickup)" });

  order.status = "cancelled";
  order.cancelledBy = "restaurant";
  order.cancellationReason = reason.trim();
  logCancellation(order, "restaurant", (req as any).user.id, reason.trim());
  await order.save();

  await PaymentTransaction.updateMany({ order: order._id }, { status: "failed" });

  // Create refund record — processed within 24 hours via cron
  await createRefundRecord(
    orderId,
    order.orderNumber,
    order.customer.toString(),
    order.payableAmount,
    `Restaurant cancelled: ${reason.trim()}`,
    "restaurant"
  );

  // Push: notify customer of cancellation + refund
  notifyOrderCancelled(order.customer.toString(), order.orderNumber, reason.trim()).catch(() => { });
  notifyRefundInitiated(order.customer.toString(), order.payableAmount, order.orderNumber).catch(() => { });

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: `Order cancelled by restaurant: ${reason.trim()}`,
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ success: true, message: "Order cancelled by restaurant", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: Cancel Order
// ─────────────────────────────────────────────────────────────────────────────
export const cancelOrder = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const orderId = req.params.orderId as string;
  const { reason } = req.body;

  const order = await Order.findOne({ _id: orderId, customer: userId });
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (!["pending", "preparing"].includes(order.status))
    return res.status(400).json({ message: "Order cannot be cancelled now" });

  // Enforce 5-minute cancellation window
  const now = new Date();
  const orderCreatedAt = new Date((order as any).createdAt);
  const diffInMinutes = (now.getTime() - orderCreatedAt.getTime()) / (1000 * 60);
  
  if (diffInMinutes > 5) {
    return res.status(400).json({ message: "Cancellation window (5 minutes) has expired" });
  }

  const cancelReason = reason?.trim() || "Cancelled by customer";
  order.status = "cancelled";
  order.cancelledBy = "customer";
  order.cancellationReason = cancelReason;
  logCancellation(order, "customer", userId, cancelReason);
  await order.save();

  await PaymentTransaction.updateMany({ order: order._id }, { status: "failed" });

  const isPriority = diffInMinutes <= 5;

  const txn = await PaymentTransaction.findOne({ order: order._id }).sort({ createdAt: -1 });
  const isOnlinePayment = txn && txn.provider !== "cod";

  if (isOnlinePayment) {
    // Create refund record
    await createRefundRecord(
      orderId,
      order.orderNumber,
      userId,
      order.payableAmount,
      cancelReason,
      "customer",
      isPriority
    );
    notifyRefundInitiated(userId, order.payableAmount, order.orderNumber).catch(() => { });
  }

  // Push: notify customer of cancellation
  notifyOrderCancelled(userId, order.orderNumber).catch(() => { });
  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Order cancelled",
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ success: true, order });
};

export const failOrder = async (req: Request, res: Response) => {
  // Extract user and order details
  const userId = (req as any).user.id;
  const orderId = req.params.orderId as string;
  const { reason } = req.body;

  const order = await Order.findOne({ _id: orderId, customer: userId });
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.status !== "pending")
    return res.status(400).json({ message: "Only pending orders can be marked as failed" });

  order.status = "failed";
  order.cancellationReason = reason || "Payment failed";
  logCancellation(order, "customer", userId, reason || "Payment failed");
  await order.save();

  await PaymentTransaction.updateMany({ order: order._id }, { status: "failed" });

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Payment failed",
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ success: true, message: "Order marked as failed", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Assign Driver
// ─────────────────────────────────────────────────────────────────────────────
export const assignOrderToDriver = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;
  const { driverId } = req.body;

  if (!driverId) return res.status(400).json({ message: "Driver ID is required" });

  const driver = await User.findOne({ _id: driverId, role: "driver" });
  if (!driver) return res.status(404).json({ message: "Driver not found" });
  if (!driver.isOnline) return res.status(400).json({ message: "Driver is currently offline" });
  if (driver.isReturning) return res.status(400).json({ message: "Driver is currently returning to store" });

  const activeOrder = await Order.findOne({
    assignedDriver: driverId,
    deliveryStatus: { $in: ["driver_notified", "accepted", "assigned", "out_for_delivery"] },
  });
  if (activeOrder)
    return res.status(400).json({ message: "Driver is already busy with another delivery" });

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  // Start the structured assignment flow with 60s timeout
  await startAssignmentFlow(orderId, driverId);

  return res.json({ message: "Driver notified about order", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER: Accept Order
// ─────────────────────────────────────────────────────────────────────────────
export const driverAcceptOrder = async (req: Request, res: Response) => {
  const driverId = (req as any).user.id;
  const orderId = req.params.orderId as string;

  const order = await Order.findOne({ _id: orderId, assignedDriver: driverId });
  if (!order) return res.status(404).json({ message: "Order not found or not assigned to you" });

  if (order.deliveryStatus !== "driver_notified")
    return res.status(400).json({ message: "Order is not awaiting driver acceptance" });

  order.deliveryStatus = "accepted";
  order.acceptedAt = new Date();
  await order.save();

  // Push: notify customer driver accepted
  notifyDriverAccepted(order.customer.toString(), order.orderNumber).catch(() => { });

  // Populate driver details to send to the frontend immediately
  const driver = await User.findById(driverId).select("name phone avatar");

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Driver has accepted your order",
    assignedDriver: driver,
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ message: "Order accepted", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER: Decline Order — logged in cancellationLog, admin re-assigns
// ─────────────────────────────────────────────────────────────────────────────
export const driverDeclineOrder = async (req: Request, res: Response) => {
  const driverId = (req as any).user.id;
  const orderId = req.params.orderId as string;
  const { reason } = req.body;

  const order = await Order.findOne({ _id: orderId, assignedDriver: driverId });
  if (!order) return res.status(404).json({ message: "Order not found or not assigned to you" });

  if (order.deliveryStatus !== "driver_notified")
    return res.status(400).json({ message: "Order is not awaiting driver acceptance" });

  const declineReason = reason?.trim() || "Driver declined the delivery";
  order.assignedDriver = undefined;
  order.deliveryStatus = "pending";
  if (!order.rejectedDrivers) order.rejectedDrivers = [];
  order.rejectedDrivers.push(driverId as any);
  logCancellation(order, "driver", driverId, declineReason);
  await order.save();

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Driver declined. Finding next nearest driver...",
    updatedAt: (order as any).updatedAt,
  });

  // Re-assign to next nearest driver logic automatically
  const { assignToNearestDriver } = await import("../services/assignment.service.js");
  assignToNearestDriver(orderId, [driverId]);

  return res.json({ message: "Order declined. Finding next nearest driver...", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER: Update Delivery Status (out_for_delivery / delivered with OTP / failed)
// ─────────────────────────────────────────────────────────────────────────────
export const updateOrderByDriver = async (req: Request, res: Response) => {
  const driverId = (req as any).user.id;
  const orderId = (Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId) as string;
  const { status, otp } = req.body;

  const allowedStatuses = ["reached_store", "picked_up", "out_for_delivery", "delivered", "failed"];
  if (!allowedStatuses.includes(status))
    return res.status(400).json({ message: "Invalid status for driver" });

  const order = await Order.findOne({ _id: orderId, assignedDriver: driverId });
  if (!order) return res.status(404).json({ message: "Order not found or not assigned to you" });

  // Delivery OTP check
  if (status === "delivered") {
    if (!otp) {
      return res.status(400).json({ message: "Delivery OTP is required. Please ask the customer for the 4-digit code." });
    }

    const customer = await User.findById(order.customer);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    if (String(otp) !== String(customer.deliveryOtp) && String(otp) !== String(order.deliveryOTP)) {
      return res.status(400).json({ message: "Invalid delivery OTP. Please ask the customer for the correct 4-digit code." });
    }

    // Check if order is COD
    const txn = await PaymentTransaction.findOne({ order: orderId }).sort({ createdAt: -1 });
    const isCod = txn && txn.provider === "cod";

    // Credit driver's wallet with driverEarnings or deliveryCharge
    const finalEarnings = order.driverEarnings || order.deliveryCharge || 0;
    
    if (finalEarnings > 0 || isCod) {
      const driver = await User.findById(driverId);
      if (driver) {
        if (isCod) {
          const payable = Number(order.payableAmount) || 0;
          driver.codBalance = (driver.codBalance || 0) + payable;
          driver.codEarnings = (driver.codEarnings || 0) + finalEarnings;
        } else {
          if (finalEarnings > 0) {
            driver.walletBalance = (driver.walletBalance || 0) + finalEarnings;
          }
        }
        await driver.save();
      }
    }
  }

  // Driver cannot mark as picked_up themselves, restaurant must verify OTP
  if (status === "picked_up") {
    return res.status(400).json({ message: "Pickup must be verified by the restaurant. Please ask the restaurant to enter your OTP." });
  }

  order.deliveryStatus = status as any;
  if (status === "delivered") {
    order.status = "delivered";
    order.deliveredAt = new Date();
  }
  
  if (status === "reached_store" && order.pickupOtp) {
    const driver = await User.findById(driverId);
    if (driver && driver.phone) {
      // Send the SMS asynchronously, don't await so we don't block the response
      sendPickupOtpSms(driver.phone, order.pickupOtp);
    }
  }

  await order.save();

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: status === "delivered" ? "Order delivered" : "Rider status updated",
    updatedAt: (order as any).updatedAt,
  });

  // Push notifications per delivery status
  if (status === "out_for_delivery") {
    notifyOutForDelivery(order.customer.toString(), order.orderNumber).catch(() => { });
  }
  if (status === "delivered") {
    notifyOrderDelivered(order.customer.toString(), order.orderNumber).catch(() => { });
  }

  // Update driver performance metrics
  if (status === "delivered") {
    await updatePerformanceOnDelivery(orderId, driverId);
    await updateDriverLedgerRef(orderId, driverId);
  }

  if (status === "delivered") {
    const remaining = await Order.findOne({
      assignedDriver: driverId,
      deliveryStatus: { $in: ["accepted", "assigned", "out_for_delivery"] },
      _id: { $ne: orderId },
    });
    if (!remaining) await User.findByIdAndUpdate(driverId, { isReturning: false });
  }

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ message: `Delivery status updated to ${status}`, order });
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: Get / Regenerate Delivery OTP
// Called after order is assigned to driver — customer shares this with driver
// ─────────────────────────────────────────────────────────────────────────────
export const getDeliveryOtp = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const orderId = req.params.orderId as string;

  const order = await Order.findOne({ _id: orderId, customer: userId });
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (!["preparing", "ready"].includes(order.status))
    return res.status(400).json({ message: "OTP is only available once order is being prepared" });

  // Generate and save OTP to customer
  const otp = generateDeliveryOtp();
  await User.findByIdAndUpdate(userId, { deliveryOtp: otp });

  return res.json({
    message: "Delivery OTP generated",
    otp,
    note: "Share this OTP with the delivery rider to confirm delivery",
  });
};
// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: Get My Orders (Grouped for Active/Past/Cancelled Tabs)
// ─────────────────────────────────────────────────────────────────────────────
export const getMyOrders = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const orders = await Order.find({ customer: userId })
    .sort({ createdAt: -1 })
    .populate("paymentTransaction")
    .populate("store", "name slug logo address phone")
    .populate("assignedDriver", "name phone avatar")
    .lean();

  const now = new Date();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  const active = orders.filter((o) => {
    if (["pending", "preparing", "ready", "picked_up", "out_for_delivery"].includes(o.status)) return true;
    if (o.status === "delivered" || o.status === "cancelled" || o.status === "failed") {
      const actionTime = o.deliveredAt ? new Date(o.deliveredAt).getTime() : new Date((o as any).updatedAt).getTime();
      return (now.getTime() - actionTime) <= 30 * 1000; // 30 seconds
    }
    return false;
  }).map(o => {
    // Hide driver details until driver accepts
    if (o.deliveryStatus === "driver_notified" || o.deliveryStatus === "pending") {
      return { ...o, assignedDriver: null };
    }
    return o;
  });
  const past = orders.filter((o) => {
    if (o.status === "delivered") {
      const deliveredTime = o.deliveredAt ? new Date(o.deliveredAt).getTime() : new Date((o as any).updatedAt).getTime();
      return (now.getTime() - deliveredTime) > 30 * 1000;
    }
    return false;
  });
  const cancelled = orders.filter((o) => {
    if (["cancelled", "failed"].includes(o.status)) {
      const actionTime = new Date((o as any).updatedAt).getTime();
      return (now.getTime() - actionTime) > 30 * 1000;
    }
    return false;
  });

  return res.json({
    success: true,
    active,
    past,
    cancelled,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: Get Order Tracking Detail (Map + Progress)
// ─────────────────────────────────────────────────────────────────────────────
export const getOrderTracking = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;
  const userId = (req as any).user.id;

  const order = await Order.findOne({ _id: orderId, customer: userId })
    .populate("store", "name location address phone logo")
    .populate("assignedDriver", "name phone avatar")
    .populate("customer", "deliveryOtp")
    .populate("items.menuItem", "name")
    .lean();

  if (!order) return res.status(404).json({ message: "Order not found" });

  // 1. Calculate current step and timeline
  let currentStep = 0; // Order Placed
  if (["preparing", "ready"].includes(order.status) || ["accepted", "reached_store"].includes(order.deliveryStatus)) currentStep = 1;
  if (["picked_up", "out_for_delivery"].includes(order.deliveryStatus) || order.status === "picked_up") currentStep = 2;
  if (order.deliveryStatus === "delivered" || order.status === "delivered") currentStep = 3;

  let timeline = [];
  if (order.orderType === "pickup") {
    timeline = [
      { status: "Order Placed", completed: true, time: order.createdAt },
      { status: "Preparing", completed: currentStep >= 1, time: currentStep >= 1 ? (order as any).updatedAt : null },
      { status: "Ready for Pickup", completed: order.status === "ready" || currentStep >= 3, time: order.status === "ready" ? (order as any).updatedAt : null },
      { status: "Collected", completed: currentStep >= 3, time: currentStep >= 3 ? (order as any).updatedAt : null },
    ];
  } else {
    timeline = [
      { status: "Order Placed", completed: true, time: order.createdAt },
      { status: "Preparing", completed: currentStep >= 1, time: currentStep >= 1 ? (order as any).updatedAt : null },
      { status: "Picked Up", completed: currentStep >= 2, time: currentStep >= 2 ? (order as any).updatedAt : null },
      { status: "Delivered", completed: currentStep >= 3, time: currentStep >= 3 ? (order as any).updatedAt : null },
    ];
  }

  // 2. Cancellation window (5 minutes)
  const now = new Date();
  const orderCreatedAt = new Date((order as any).createdAt);
  const diffInMinutes = (now.getTime() - orderCreatedAt.getTime()) / (1000 * 60);
  const canCancel = diffInMinutes <= 5 && ["pending", "preparing"].includes(order.status);

  // 3. Rider details logic (show when driver is assigned and active)
  const showRider = ["accepted", "assigned", "reached_store", "picked_up", "out_for_delivery", "delivered"].includes(order.deliveryStatus);

  return res.json({
    success: true,
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      payableAmount: order.payableAmount,
      itemsCount: order.items.length,
      items: order.items.map((item: any) => ({
        id: item.menuItem?._id || null,
        name: item.menuItem?.name || "Item",
        qty: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity
      })),
      store: order.store,
      assignedDriver: showRider ? order.assignedDriver : null,
      deliveryOTP: order.deliveryOTP,
      orderType: order.orderType,
      pickupTime: order.pickupTime,
    },
    currentStep,
    timeline,
    canCancel,
    remainingCancellationTime: Math.max(0, 5 - diffInMinutes),
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// ANY: Get Order By ID
// ─────────────────────────────────────────────────────────────────────────────
export const getOrderById = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;
  const user = (req as any).user;

  const order = await Order.findById(orderId)
    .populate("customer", "name phone")
    .populate("paymentTransaction");

  if (!order) return res.status(404).json({ message: "Order not found" });

  const isAdmin = user.role === "admin";
  const isOwner = order.customer._id.toString() === user.id;
  const isAssignedDriver = order.assignedDriver?.toString() === user.id;

  if (!isAdmin && !isOwner && !isAssignedDriver)
    return res.status(403).json({ message: "Access denied" });

  const orderObj = order.toObject();
  if (isOwner && (orderObj.deliveryStatus === "driver_notified" || orderObj.deliveryStatus === "pending")) {
    orderObj.assignedDriver = undefined;
  }

  return res.json(orderObj);
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Update Order Status
// ─────────────────────────────────────────────────────────────────────────────
export const updateOrderStatus = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;
  const { status } = req.body;

  const allowedStatus = ["preparing", "ready", "cancelled", "failed"];
  if (!allowedStatus.includes(status))
    return res.status(400).json({ message: "Invalid status" });

  const order = await Order.findByIdAndUpdate(orderId, { status }, { new: true });
  if (!order) return res.status(404).json({ message: "Order not found" });

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    updatedAt: (order as any).updatedAt,
  });

  return res.json(order);
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get All Orders
// ─────────────────────────────────────────────────────────────────────────────
export const getAllOrders = async (req: Request, res: Response) => {
  const { status, deliveryStatus, from, to } = req.query;
  const query: any = {};

  if (status) query.status = status;
  if (deliveryStatus) query.deliveryStatus = deliveryStatus;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from as string);
    if (to) query.createdAt.$lte = new Date(to as string);
  }

  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .populate("customer", "name phone");

  return res.json(orders);
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER: Get My Orders
// ─────────────────────────────────────────────────────────────────────────────
export const getDriverOrders = async (req: Request, res: Response) => {
  const driverId = (req as any).user.id;
  const { status, deliveryStatus } = req.query;

  const query: any = { assignedDriver: driverId };
  if (status) query.status = status;
  if (deliveryStatus) query.deliveryStatus = deliveryStatus;

  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .populate("customer", "name phone");

  return res.json(orders);
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get All Cancellations (from cancellationLog embedded in orders)
// Filter: ?cancelledBy=restaurant|customer|driver&restaurantId=&from=&to=
// ─────────────────────────────────────────────────────────────────────────────
export const getAllCancellations = async (req: Request, res: Response) => {
  const cancelledBy = req.query.cancelledBy as string;
  const restaurantId = req.query.restaurantId as string;
  const { from, to } = req.query;
  const query: any = { status: "cancelled" };

  if (cancelledBy) query.cancelledBy = cancelledBy;
  if (restaurantId) query.store = restaurantId;
  if (from || to) {
    query.updatedAt = {};
    if (from) query.updatedAt.$gte = new Date(from as string);
    if (to) query.updatedAt.$lte = new Date(to as string);
  }

  const orders = await Order.find(query)
    .sort({ updatedAt: -1 })
    .select("orderNumber status cancelledBy cancellationReason cancellationLog store customer totalAmount payableAmount updatedAt")
    .populate("customer", "name phone")
    .populate("store", "name slug storeType");

  return res.json({ total: orders.length, orders });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get Cancellations by Restaurant
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantCancellations = async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string;
  const { from, to } = req.query;

  const query: any = { store: restaurantId, cancelledBy: "restaurant" };
  if (from || to) {
    query.updatedAt = {};
    if (from) query.updatedAt.$gte = new Date(from as string);
    if (to) query.updatedAt.$lte = new Date(to as string);
  }

  const orders = await Order.find(query)
    .sort({ updatedAt: -1 })
    .select("orderNumber status cancellationReason cancellationLog totalAmount payableAmount updatedAt")
    .populate("customer", "name phone");

  return res.json({ total: orders.length, orders });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Cancellation Stats
// ─────────────────────────────────────────────────────────────────────────────
export const getCancellationStats = async (req: Request, res: Response) => {
  const { from, to } = req.query;

  const matchStage: any = { status: "cancelled" };
  if (from || to) {
    matchStage.updatedAt = {};
    if (from) matchStage.updatedAt.$gte = new Date(from as string);
    if (to) matchStage.updatedAt.$lte = new Date(to as string);
  }

  const breakdown = await Order.aggregate([
    { $match: matchStage },
    { $group: { _id: "$cancelledBy", count: { $sum: 1 } } },
  ]);

  const total = await Order.countDocuments({ status: "cancelled" });

  return res.json({ total, breakdown });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: Get Active Orders
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantOrders = async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  const orders = await Order.find({ store: restaurantId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("customer", "name phone")
    .populate("assignedDriver", "name phone riderId");

  return res.json(orders);
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER: Send Pickup OTP to Terminal
// ─────────────────────────────────────────────────────────────────────────────
export const sendPickupOtp = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;
  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (!order.pickupOtp) {
    return res.status(400).json({ message: "No pickup OTP generated for this order" });
  }

  // Log to terminal for debugging
  console.log(`\n===========================================`);
  console.log(`[RIDER PICKUP OTP]`);
  console.log(`Order ID: ${order._id}`);
  console.log(`>>> OTP CODE: ${order.pickupOtp} <<<`);
  console.log(`===========================================\n`);

  // Send the OTP via SMS to the assigned driver
  if (order.assignedDriver) {
    const driver = await User.findById(order.assignedDriver);
    if (driver && driver.phone) {
      console.log(`[Pickup OTP] Sending SMS to driver ${driver.name} at ${driver.phone}`);
      sendPickupOtpSms(driver.phone, order.pickupOtp);
    } else {
      console.log(`[Pickup OTP] Driver not found or no phone number`);
    }
  } else {
    console.log(`[Pickup OTP] No driver assigned to this order`);
  }

  return res.json({ message: "OTP sent successfully via SMS" });
};

// ─── DRIVER: Send Delivery OTP to Customer ──────────────────────────────────────────────
export const sendDeliveryOtp = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;
  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (!order.deliveryOTP) {
    return res.status(400).json({ message: "No delivery OTP generated for this order" });
  }

  // Log to terminal for debugging
  console.log(`\n===========================================`);
  console.log(`[DRIVER DELIVERY OTP]`);
  console.log(`Order ID: ${order._id}`);
  console.log(`>>> OTP CODE: ${order.deliveryOTP} <<<`);
  console.log(`===========================================\n`);

  // Ensure customer exists and has phone number
  if (order.customer) {
    const customer = await User.findById(order.customer);
    if (customer && customer.phone) {
      // Sync it to user doc for older verification method just in case
      customer.deliveryOtp = order.deliveryOTP;
      await customer.save();

      console.log(`[Delivery OTP] Sending SMS to customer ${customer.name} at ${customer.phone}`);
      sendDeliveryOtpSms(customer.phone, order.deliveryOTP);
    } else {
      console.log(`[Delivery OTP] Customer not found or no phone number`);
    }
  }

  return res.json({ message: "Delivery OTP sent successfully to customer" });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: Mark Order as Preparing
// ─────────────────────────────────────────────────────────────────────────────
export const restaurantMarkPreparing = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;
  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.status === "preparing") {
      return res.json({ message: "Order is already in preparing state", order });
  }

  if (order.status !== "pending") {
    return res.status(400).json({ message: "Order must be in pending state to prepare" });
  }

  order.status = "preparing";
  await order.save();
  
  emitOrderStatusUpdate(orderId, {
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      message: "Restaurant has started preparing your order",
      updatedAt: (order as any).updatedAt,
  });

  return res.json({ message: "Order marked as preparing", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: Verify Pickup OTP & Handover
// ─────────────────────────────────────────────────────────────────────────────
export const restaurantVerifyPickup = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;
  const { otp } = req.body;

  const order = await Order.findById(orderId).populate("assignedDriver", "name phone");
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.status !== "ready") {
    return res.status(400).json({ message: "Order is not ready for pickup" });
  }

  if (!order.pickupOtp) {
    return res.status(400).json({ message: "No pickup OTP set for this order" });
  }

  // Note: Removed 10-minute expiry because driver might take longer to arrive

  if (String(otp) !== String(order.pickupOtp)) {
    return res.status(400).json({ message: "Invalid pickup OTP" });
  }

  order.deliveryStatus = "picked_up";
  order.status = "picked_up";
  await order.save();

  // Credit the restaurant's wallet bucket
  const restaurant = await Restaurant.findById(order.store);
  if (restaurant) {
      restaurant.walletBalance += order.payableAmount;
      await restaurant.save();
  }

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Order picked up by rider",
    updatedAt: (order as any).updatedAt,
    driverName: (order.assignedDriver as any)?.name || "Rider",
    driverPhone: (order.assignedDriver as any)?.phone || "",
  });

  return res.json({ success: true, message: "OTP verified. Order handed over.", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: Complete Self-Pickup Order
// ─────────────────────────────────────────────────────────────────────────────
export const restaurantCompletePickup = async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.orderType !== "pickup") {
    return res.status(400).json({ message: "Only self-pickup orders can be completed by restaurant" });
  }

  if (order.status !== "ready") {
    return res.status(400).json({ message: "Order must be ready before it can be completed" });
  }

  order.deliveryStatus = "delivered";
  order.status = "delivered";
  order.deliveredAt = new Date();
  await order.save();

  // Credit the restaurant's wallet
  const restaurant = await Restaurant.findById(order.store);
  if (restaurant) {
      restaurant.walletBalance = (restaurant.walletBalance || 0) + order.payableAmount;
      await restaurant.save();
  }

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Order has been collected by the customer",
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ success: true, message: "Order marked as collected", order });
};
