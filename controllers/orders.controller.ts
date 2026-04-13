// controllers/order.controller.ts
import Order from "../models/Order.model.js";
import Cart from "../models/Cart.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import Invoice from "../models/Invoice.model.js";
import { razorpay } from "../config/razorpay.config.js";
import crypto from "crypto";
import { Request, Response } from "express";
import { confirmOrderLogic } from "../services/order.service.js";
import User from "../models/User.model.js";
import { emitOrderStatusUpdate } from "../socket/orderSocket.js";
import Address from "../models/Address.model.js";
import { calculateDeliveryCharge, isWithinIndore } from "../utils/delivery.utils.js";

export const createOrder = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { addressId, paymentMethod } = req.body;

  if (!addressId)
    return res.status(400).json({ message: "Address is required" });

  // 1️⃣ Fetch & validate address
  const addressDoc = await Address.findOne({
    _id: addressId,
    user: userId,
  });

  if (!addressDoc)
    return res.status(404).json({ message: "Address not found" });

  // ✅ Geo Location Check
  const { location } = addressDoc;
  if (!location || !location.coordinates || location.coordinates.length < 2) {
    return res.status(400).json({
      message: "Location coordinates are required"
    });
  }
  const [lng, lat] = location.coordinates;
  if (!isWithinIndore(lat, lng)) {
    return res.status(400).json({
      message: "Delivery is only available in Indore"
    });
  }

  // 2️⃣ Get cart
  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0)
    return res.status(400).json({ message: "Cart empty" });

  // 3️⃣ Snapshot address
  const addressSnapshot = {
    fullAddress: addressDoc.fullAddress,
    apartment: addressDoc.apartment,
    landmark: addressDoc.landmark,
    location: addressDoc.location,
    phone: addressDoc.phone,
  };

  // 4️⃣ Calculate amount
  const totalAmount = cart.items.reduce(
    (s, i) => s + i.priceAtAdd * i.qty,
    0
  );

  // ✅ Min order check
  if (totalAmount < 100) {
    return res.status(400).json({
      message: "Minimum order amount is ₹100"
    });
  }

  // ✅ Delivery charge
  const deliveryCharge = calculateDeliveryCharge(totalAmount);
  const payableAmount = totalAmount + deliveryCharge;

  // 5️⃣ Create order
  const order = await Order.create({
    orderNumber: `ORD-${Date.now()}`,
    customer: userId,
    items: cart.items.map(i => ({
      product: i.product,
      name: i.name,
      variantIndex: i.variantIndex,
      qty: i.qty,
      price: i.priceAtAdd,
      subtotal: i.priceAtAdd * i.qty,
    })),
    totalAmount,
    deliveryCharge,
    payableAmount,
    address: addressSnapshot,
    status: "pending",
    deliveryStatus: "pending",
  });

  // 6️⃣ COD flow
  if (paymentMethod === "cod") {
    await PaymentTransaction.create({
      order: order._id,
      provider: "cod",
      amount: payableAmount,
      status: "success",
    });

    await confirmOrderLogic(order._id.toString());
    const updatedOrder = await Order.findById(order._id);
    return res.json({ order: updatedOrder, cod: true });
  }

  // 7️⃣ Razorpay flow
  const razorpayOrder = await razorpay.orders.create({
    amount: payableAmount * 100,
    currency: "INR",
    receipt: order.orderNumber,
    payment_capture: true,
  });

  await PaymentTransaction.create({
    order: order._id,
    provider: "razorpay",
    providerPaymentId: razorpayOrder.id,
    amount: payableAmount,
    status: "initiated",
  });

  res.json({
    orderId: order._id,
    razorpayOrderId: razorpayOrder.id,
    amount: payableAmount,
    deliveryCharge,
    currency: "INR",
  });
};

export const verifyPayment = async (req: Request, res: Response) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature)
    return res.status(400).json({ message: "Invalid payment signature" });

  const transaction = await PaymentTransaction.findOne({
    providerPaymentId: razorpay_order_id,
  });

  if (!transaction)
    return res.status(404).json({ message: "Transaction not found" });

  transaction.status = "success";
  transaction.meta = { razorpay_payment_id };
  await transaction.save();

  await confirmOrderLogic(transaction.order.toString());

  res.json({ success: true });
};

export const getMyOrders = async (req: Request, res: Response) => {
  const userId = req.user.id;

  const orders = await Order.find({ customer: userId })
    .sort({ createdAt: -1 })
    .populate("paymentTransaction");

  res.json(orders);
};

export const getOrderById = async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const user = (req as any).user;

  const order = await Order.findById(orderId)
    .populate("customer", "name email")
    .populate("paymentTransaction");

  if (!order)
    return res.status(404).json({ message: "Order not found" });

  const isAdmin = user.role === "admin";
  const isOwner = order.customer._id.toString() === user.id;
  const isAssignedDriver = order.assignedDriver?.toString() === user.id;

  if (!isAdmin && !isOwner && !isAssignedDriver) {
    return res.status(403).json({ message: "You do not have permission to access this order" });
  }

  res.json(order);
};

export const cancelOrder = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { orderId } = req.params;

  const order = await Order.findOne({ _id: orderId, customer: userId });

  if (!order)
    return res.status(404).json({ message: "Order not found" });

  if (!["pending", "confirmed"].includes(order.status))
    return res.status(400).json({ message: "Order cannot be cancelled now" });

  order.status = "cancelled";
  await order.save();

  await PaymentTransaction.updateMany(
    { order: order._id },
    { status: "failed" }
  );

  res.json({ success: true, order });
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const allowedStatus = [
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "failed",
  ];

  if (!allowedStatus.includes(status))
    return res.status(400).json({ message: "Invalid status" });

  const order = await Order.findByIdAndUpdate(
    orderId,
    { status },
    { new: true }
  );

  if (!order)
    return res.status(404).json({ message: "Order not found" });

  res.json(order);
};

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
    .populate("customer", "name email");

  res.json(orders);
};

export const assignOrderToDriver = async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { driverId } = req.body;

  if (!driverId)
    return res.status(400).json({ message: "Driver ID is required" });

  const driver = await User.findOne({ _id: driverId, role: "driver" });
  if (!driver)
    return res.status(404).json({ message: "Driver not found" });

  if (!driver.isOnline)
    return res.status(400).json({ message: "Driver is currently offline" });

  if (driver.isReturning)
    return res.status(400).json({ message: "Driver is currently returning to store" });

  const activeOrder = await Order.findOne({
    assignedDriver: driverId,
    deliveryStatus: { $in: ["assigned", "out_for_delivery"] }
  });

  if (activeOrder)
    return res.status(400).json({ message: "Driver is already busy with another delivery" });

  const order = await Order.findById(orderId);
  if (!order)
    return res.status(404).json({ message: "Order not found" });

  order.assignedDriver = driverId as any;
  order.deliveryStatus = "assigned";
  driver.isReturning = true;
  await order.save();
  await driver.save();

  res.json({ message: "Order assigned to driver", order });
};

export const getDriverOrders = async (req: Request, res: Response) => {
  const driverId = req.user.id;
  const { status, deliveryStatus } = req.query;

  const query: any = { assignedDriver: driverId };
  if (status) query.status = status;
  if (deliveryStatus) query.deliveryStatus = deliveryStatus;

  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .populate("customer", "name phone");

  res.json(orders);
};

export const updateOrderByDriver = async (req: Request, res: Response) => {
  const driverId = req.user.id;
  const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
  const { status } = req.body;

  const allowedStatuses = ["out_for_delivery", "delivered", "failed"];
  if (!allowedStatuses.includes(status))
    return res.status(400).json({ message: "Invalid status for driver" });

  const order = await Order.findOne({ _id: orderId, assignedDriver: driverId });
  if (!order)
    return res.status(404).json({ message: "Order not found or not assigned to you" });

  order.deliveryStatus = status as any;
  await order.save();

  if (status === "delivered") {
    const remainingOrders = await Order.findOne({
      assignedDriver: driverId,
      deliveryStatus: { $in: ["assigned", "out_for_delivery"] },
      _id: { $ne: orderId }
    });

    if (!remainingOrders) {
      await User.findByIdAndUpdate(driverId, { isReturning: true });
    }
  }

  emitOrderStatusUpdate(orderId, {
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    updatedAt: (order as any).updatedAt,
  });

  res.json({ message: `Order status updated to ${status}`, order });
};