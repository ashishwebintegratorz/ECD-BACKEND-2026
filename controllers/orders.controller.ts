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
} from "../socket/orderSocket.js";
import Address from "../models/Address.model.js";
import { calculateDeliveryCharge, isWithinIndore } from "../utils/delivery.utils.js";
import Restaurant from "../models/Restaurant.model.js";
import DriverLocation from "../models/DriverLocation.model.js";
import { getRouteFromORS } from "../services/tracking.service.js";

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
  const { addressId, paymentMethod, restaurantId, couponCode, address: rawAddress } = req.body;

  // Use dummy restaurant ID for testing if missing
  const effectiveRestaurantId = restaurantId || '69ef47bf77c29363016a95e5'; 

  let addressDoc;
  if (addressId) {
    if (addressId === '662b6a9c1234567890abcdef' || addressId === '69e22638dd7aa8136ea91774') {
      addressDoc = {
        _id: addressId,
        fullAddress: 'Dummy Address, Indore',
        location: { coordinates: [75.8577, 22.7196] },
        phone: '9876543210',
        label: 'Dummy'
      };
    } else {
      try {
        addressDoc = await Address.findOne({ _id: addressId, user: userId });
      } catch (e) {
        return res.status(400).json({ message: "Invalid Address ID format" });
      }
    }
  } else if (rawAddress) {
    // Use raw address object sent from frontend (e.g., current location)
    addressDoc = rawAddress;
  }

  if (!addressDoc) return res.status(400).json({ message: "Address or Address ID is required" });

  const { location } = addressDoc;
  if (!location?.coordinates || location.coordinates.length < 2)
    return res.status(400).json({ message: "Location coordinates are required" });

  const [lng, lat] = location.coordinates;
  // Skip Indore check for dummy/raw address for now or keep it if coordinates exist
  if (addressId !== '662b6a9c1234567890abcdef' && !isWithinIndore(lat, lng))
    return res.status(400).json({ message: "Delivery is only available in Indore" });

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

  const addressSnapshot = {
    fullAddress: addressDoc.fullAddress,
    apartment: addressDoc.apartment,
    landmark: addressDoc.landmark,
    location: addressDoc.location,
    phone: addressDoc.phone,
  };

  const totalAmount = cart.items.reduce((s, i) => s + i.priceAtAdd * i.qty, 0);
  if (totalAmount < 100)
    return res.status(400).json({ message: "Minimum order amount is ₹100" });

  const deliveryCharge = calculateDeliveryCharge(totalAmount);
  
  // ── Fetch store to check type (Restaurant/Grocery) for GST ───────────────
  const store = await Restaurant.findById(effectiveRestaurantId);
  const isRestaurant = store?.storeType === "restaurant";

  // ── Coupon validation ─────────────────────────────────────────────────────
  let totalDiscount = 0;
  let appliedCoupon: { couponId: string; code: string; discountAmount: number } | undefined;
  
  if (couponCode) {
    const couponResult = await validateCoupon(couponCode, userId, effectiveRestaurantId, totalAmount);
    if (!couponResult.ok)
      return res.status(400).json({ message: couponResult.message });
    
    totalDiscount = couponResult.discountAmount!;
    appliedCoupon = {
      couponId: couponResult.couponId!,
      code: couponCode.toUpperCase().trim(),
      discountAmount: totalDiscount,
    };
  }

  // ── GST Calculation (5% for Restaurants) ──────────────────────────────────
  const taxableAmount = Math.max(0, totalAmount - totalDiscount);
  const gst = isRestaurant ? Math.round(taxableAmount * 0.05) : 0;
  const payableAmount = taxableAmount + deliveryCharge + gst;

  console.log("Creating Order with data:", JSON.stringify({
    orderNumber: `ORD-${Date.now()}`,
    customer: userId,
    store: effectiveRestaurantId,
    itemsCount: cart.items.length,
    totalAmount,
    payableAmount,
    addressSnapshot
  }, null, 2));

  let order;
  try {
    order = await Order.create({
      orderNumber: `ORD-${Date.now()}`,
      customer: userId,
      store: effectiveRestaurantId,   // generic store ref (restaurant or grocery)
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
      deliveryStatus: "pending",
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
    await PaymentTransaction.create({
      order: order._id,
      provider: "cod",
      amount: payableAmount,
      status: "success",
    });
    await confirmOrderLogic(order._id.toString());

    // Auto-generate delivery OTP for customer
    const deliveryOtp = generateDeliveryOtp();
    await User.findByIdAndUpdate(userId, { deliveryOtp });

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

  // Razorpay flow
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(payableAmount * 100),
    currency: "INR",
    receipt: order.orderNumber,
    payment_capture: true,
  });

  console.log("RAZORPAY ORDER CREATED (Order Flow):", JSON.stringify(razorpayOrder, null, 2));

  await PaymentTransaction.create({
    order: order._id,
    provider: "razorpay",
    providerPaymentId: razorpayOrder.id,
    amount: payableAmount,
    status: "initiated",
  });

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

  // Auto-generate delivery OTP for customer after Razorpay payment
  const confirmedOrder = await Order.findById(transaction.order);
  if (confirmedOrder) {
    const deliveryOtp = generateDeliveryOtp();
    await User.findByIdAndUpdate(confirmedOrder.customer, { deliveryOtp });
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

  if (order.status !== "preparing")
    return res.status(400).json({ message: "Order must be in preparing state" });

  order.status = "ready";
  order.pickupOtp = generateDeliveryOtp(); // Reuse the same 4-digit helper
  await order.save();

  // Push: order ready
  notifyOrderReady(order.customer.toString(), order.orderNumber).catch(() => { });

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Your order is ready. A rider will be assigned shortly.",
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ message: "Order marked as ready. Admin will assign a rider.", order });
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

  if (order.status !== "preparing")
    return res.status(400).json({ message: "Order can only be cancelled while preparing" });

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
  const userId = req.user.id;
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

  // Push: notify customer of cancellation + refund
  notifyOrderCancelled(userId, order.orderNumber).catch(() => { });
  notifyRefundInitiated(userId, order.payableAmount, order.orderNumber).catch(() => { });

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Order cancelled",
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ success: true, order });
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

  order.assignedDriver = driverId as any;
  order.deliveryStatus = "driver_notified";
  await order.save();

  // Push: notify driver
  notifyDriverAssigned(driverId, order.orderNumber, order._id.toString()).catch(() => { });

  emitOrderAssignedToDriver(driverId, {
    orderId: order._id,
    orderNumber: order.orderNumber,
    address: order.address,
    message: "You have a new delivery. Please accept or decline.",
  });

  return res.json({ message: "Driver notified about order", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER: Accept Order
// ─────────────────────────────────────────────────────────────────────────────
export const driverAcceptOrder = async (req: Request, res: Response) => {
  const driverId = req.user.id;
  const orderId = req.params.orderId as string;

  const order = await Order.findOne({ _id: orderId, assignedDriver: driverId });
  if (!order) return res.status(404).json({ message: "Order not found or not assigned to you" });

  if (order.deliveryStatus !== "driver_notified")
    return res.status(400).json({ message: "Order is not awaiting driver acceptance" });

  order.deliveryStatus = "accepted";
  await order.save();

  // Push: notify customer driver accepted
  notifyDriverAccepted(order.customer.toString(), order.orderNumber).catch(() => { });

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Driver has accepted your order",
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ message: "Order accepted", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER: Decline Order — logged in cancellationLog, admin re-assigns
// ─────────────────────────────────────────────────────────────────────────────
export const driverDeclineOrder = async (req: Request, res: Response) => {
  const driverId = req.user.id;
  const orderId = req.params.orderId as string;
  const { reason } = req.body;

  const order = await Order.findOne({ _id: orderId, assignedDriver: driverId });
  if (!order) return res.status(404).json({ message: "Order not found or not assigned to you" });

  if (order.deliveryStatus !== "driver_notified")
    return res.status(400).json({ message: "Order is not awaiting driver acceptance" });

  const declineReason = reason?.trim() || "Driver declined the delivery";
  order.assignedDriver = undefined;
  order.deliveryStatus = "pending";
  logCancellation(order, "driver", driverId, declineReason);
  await order.save();

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    message: "Driver declined. Please re-assign a driver.",
    updatedAt: (order as any).updatedAt,
  });

  return res.json({ message: "Order declined. Admin will re-assign a driver.", order });
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER: Update Delivery Status (out_for_delivery / delivered with OTP / failed)
// ─────────────────────────────────────────────────────────────────────────────
export const updateOrderByDriver = async (req: Request, res: Response) => {
  const driverId = req.user.id;
  const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
  const { status, otp } = req.body;

  const allowedStatuses = ["out_for_delivery", "delivered", "failed"];
  if (!allowedStatuses.includes(status))
    return res.status(400).json({ message: "Invalid status for driver" });

  const order = await Order.findOne({ _id: orderId, assignedDriver: driverId });
  if (!order) return res.status(404).json({ message: "Order not found or not assigned to you" });

  // OTP check on delivery (REMOVED per instructions)
  /*
  if (status === "delivered") {
    const customer = await User.findById(order.customer);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    if (!customer.deliveryOtp) return res.status(400).json({ message: "Customer has no delivery OTP set" });
    if (!otp) return res.status(400).json({ message: "OTP is required to confirm delivery" });
    if (String(otp) !== String(customer.deliveryOtp))
      return res.status(400).json({ message: "Invalid delivery OTP" });
  }
  */

  order.deliveryStatus = status as any;
  if (status === "delivered") order.status = "ready";
  await order.save();

  // Push notifications per delivery status
  if (status === "out_for_delivery") {
    notifyOutForDelivery(order.customer.toString(), order.orderNumber).catch(() => { });
  }
  if (status === "delivered") {
    notifyOrderDelivered(order.customer.toString(), order.orderNumber).catch(() => { });
  }

  // Update driver ledger ref now that we know who delivered
  if (status === "delivered") {
    await updateDriverLedgerRef(orderId, driverId);
  }

  if (status === "delivered") {
    const remaining = await Order.findOne({
      assignedDriver: driverId,
      deliveryStatus: { $in: ["accepted", "assigned", "out_for_delivery"] },
      _id: { $ne: orderId },
    });
    if (!remaining) await User.findByIdAndUpdate(driverId, { isReturning: true });
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
  const userId = req.user.id;
  const { orderId } = req.params;

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
  const userId = req.user.id;
  const orders = await Order.find({ customer: userId })
    .sort({ createdAt: -1 })
    .populate("paymentTransaction")
    .populate("store", "name slug logo address")
    .lean();

  const now = new Date();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  const active = orders.filter((o) => {
    const isInProgress = !["delivered", "failed", "cancelled"].includes(o.deliveryStatus) && 
                         !["cancelled", "failed"].includes(o.status);
    const isRecent = new Date(o.createdAt) > threeHoursAgo;
    return isInProgress && isRecent;
  });
  
  const past = orders.filter((o) => {
    const isDelivered = o.deliveryStatus === "delivered";
    const isOldAndNotCancelled = new Date(o.createdAt) <= threeHoursAgo && 
                                 !["cancelled", "failed"].includes(o.status) &&
                                 o.deliveryStatus !== "cancelled";
    return isDelivered || isOldAndNotCancelled;
  });
  
  const cancelled = orders.filter((o) => 
    o.status === "cancelled" || 
    o.deliveryStatus === "cancelled" || 
    o.status === "failed" || 
    o.deliveryStatus === "failed"
  );

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
  const { orderId } = req.params;
  const userId = req.user.id;

  const order = await Order.findOne({ _id: orderId, customer: userId })
    .populate("store", "name location address phone logo")
    .populate("assignedDriver", "name phone avatar")
    .lean();

  if (!order) return res.status(404).json({ message: "Order not found" });

  // 1. Calculate current step and timeline
  let currentStep = 0; // Order Placed
  if (order.status === "preparing") currentStep = 1;
  if (order.status === "ready" && order.deliveryStatus !== "out_for_delivery") currentStep = 1;
  if (order.deliveryStatus === "out_for_delivery") currentStep = 2;
  if (order.deliveryStatus === "delivered") currentStep = 3;

  const timeline = [
    { status: "Order Placed", completed: true, time: order.createdAt },
    { status: "Preparing", completed: currentStep >= 1, time: currentStep >= 1 ? (order as any).updatedAt : null },
    { status: "On the Way", completed: currentStep >= 2, time: currentStep >= 2 ? (order as any).updatedAt : null },
    { status: "Delivered", completed: currentStep >= 3, time: currentStep >= 3 ? (order as any).updatedAt : null },
  ];

  // 2. Cancellation window (5 minutes)
  const now = new Date();
  const orderCreatedAt = new Date((order as any).createdAt);
  const diffInMinutes = (now.getTime() - orderCreatedAt.getTime()) / (1000 * 60);
  const canCancel = diffInMinutes <= 5 && ["pending", "preparing"].includes(order.status);

  // 3. Rider details logic (only show when on the way or delivered)
  const showRider = ["out_for_delivery", "delivered"].includes(order.deliveryStatus);

  return res.json({
    success: true,
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      payableAmount: order.payableAmount,
      itemsCount: order.items.length,
      store: order.store,
      assignedDriver: showRider ? order.assignedDriver : null,
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
  const { orderId } = req.params;
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

  return res.json(order);
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
  const driverId = req.user.id;
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
  const { cancelledBy, restaurantId, from, to } = req.query;
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
  const { restaurantId } = req.params;
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
