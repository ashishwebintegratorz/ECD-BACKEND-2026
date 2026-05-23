import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import Order from "../models/Order.model.js";
import DriverLocation from "../models/DriverLocation.model.js";
import { haversineDistance } from "../utils/delivery.utils.js";
import { BadRequestException, NotFoundException } from "../utils/appError.js";

/**
 * GET: Current active order for the driver
 */
export const getActiveOrder = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user._id;
    const order = await Order.findOne({
        assignedDriver: driverId,
        deliveryStatus: { $in: ["accepted", "assigned", "out_for_delivery", "reached_store", "driver_notified"] }
    }).populate("store").populate("customer", "name phone avatar").populate("address");

    if (!order) return res.json({ order: null });

    // Calculate dynamic data
    const driverLoc = await DriverLocation.findOne({ driver: driverId });
    const driverCoords = driverLoc?.location?.coordinates || [0, 0];
    
    const restaurant: any = order.store;
    const restCoords = restaurant?.location?.coordinates || [0, 0];
    
    // Distance to store
    const distToStore = haversineDistance(driverCoords[1], driverCoords[0], restCoords[1], restCoords[0]);
    
    // Distance to customer (if we have customer coords in address)
    let distToCustomer = 0;
    if (order.address && (order.address as any).location) {
        const custCoords = (order.address as any).location.coordinates;
        distToCustomer = haversineDistance(restCoords[1], restCoords[0], custCoords[1], custCoords[0]);
    }

    // Estimated time (10 min base + 3 min per km)
    const estDeliveryTimeMinutes = Math.ceil(10 + (distToCustomer * 3));

    return res.json({ 
        order,
        restaurant: {
            name: restaurant?.name,
            phone: restaurant?.phone,
            address: restaurant?.address,
            paymentQr: restaurant?.paymentQr,
            distance_km: distToStore.toFixed(1)
        },
        customer: {
            name: (order.customer as any)?.name,
            phone: (order.customer as any)?.phone,
            address: typeof order.address === "string" ? order.address : ((order.address as any)?.fullAddress || (order.address as any)?.address || "N/A"),
            distance_km: distToCustomer.toFixed(1)
        },
        tracking: {
            status: order.deliveryStatus,
            estimated_delivery_time_minutes: estDeliveryTimeMinutes,
            driver_location: {
                lat: driverCoords[1],
                lng: driverCoords[0]
            }
        }
    });
});

/**
 * GET: Order history (Completed and Cancelled)
 */
export const getOrderHistory = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user._id;
    const { status } = req.query; // 'delivered' or 'cancelled'

    const filter: any = { assignedDriver: driverId };
    if (status === "delivered") {
        filter.deliveryStatus = "delivered";
    } else if (status === "cancelled") {
        filter.deliveryStatus = "cancelled";
    } else {
        filter.deliveryStatus = { $in: ["delivered", "cancelled", "failed"] };
    }

    const orders = await Order.find(filter)
        .populate("store")
        .populate("customer", "name phone avatar")
        .sort({ updatedAt: -1 });

    const formattedOrders = orders.map(order => {
        const restaurant: any = order.store;
        const customer: any = order.customer;
        
        return {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.deliveryStatus,
            restaurant: {
                name: restaurant?.name,
                address: restaurant?.address,
                distance_km: "N/A" // Distance is not tracked for history
            },
            customer: {
                name: customer?.name,
                phone: customer?.phone,
                address: typeof order.address === "string" ? order.address : (order.address as any)?.address,
                payableAmount: order.payableAmount,
                city: typeof order.address === "object" ? (order.address as any).city : "Indore"
            },
            items: order.items.map(item => ({
                name: item.name,
                qty: item.qty,
                price: item.price
            })),
            deliveredAt: order.deliveredAt,
            updatedAt: order.updatedAt
        };
    });

    return res.json({ orders: formattedOrders });
});

/**
 * PATCH: Confirm manual payment receipt (COD)
 */
export const confirmPaymentReceipt = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user._id;
    const { orderId } = req.body;

    const order = await Order.findOne({ _id: orderId, assignedDriver: driverId });
    if (!order) throw new NotFoundException("Order not found");

    if (order.deliveryStatus !== "delivered") {
        throw new BadRequestException("Payment can only be confirmed for delivered orders");
    }

    order.meta = { ...order.meta, paymentConfirmedByDriver: true, paymentConfirmedAt: new Date() };
    // In a real app, you might update a separate Payment model here
    await order.save();

    return res.json({ message: "Payment confirmed successfully", order });
});

/**
 * PATCH: Complete Delivery with OTP
 */
export const completeDeliveryWithOTP = asyncHandler(async (req: Request, res: Response) => {
    const driverId = (req as any).user._id;
    const { orderId, otp } = req.body;

    if (!otp) throw new BadRequestException("OTP is required to complete delivery");

    const order = await Order.findOne({ _id: orderId, assignedDriver: driverId });
    if (!order) throw new NotFoundException("Order not found or not assigned to you");

    if (order.deliveryStatus === "delivered") {
        throw new BadRequestException("Order is already delivered");
    }

    if (order.deliveryOTP !== otp) {
        throw new BadRequestException("Invalid Delivery OTP");
    }

    order.deliveryStatus = "delivered";
    order.deliveredAt = new Date();
    order.statusHistory.push({
        status: "delivered",
        timestamp: new Date(),
        note: "Delivery completed with OTP verification by driver"
    });

    await order.save();

    return res.json({ message: "Delivery completed successfully", order });
});
