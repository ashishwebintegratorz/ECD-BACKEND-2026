import { z } from "zod";

const mongoId = z.string().length(24, "Invalid ID format");

export const createOrderSchema = z.object({
  body: z.object({
    restaurantId: mongoId,
    addressId: mongoId.optional(),
    address: z.object({
      fullAddress: z.string().min(5),
      apartment: z.string().optional(),
      landmark: z.string().optional(),
      location: z.object({
        type: z.literal("Point"),
        coordinates: z.tuple([z.number(), z.number()]),
      }).optional(),
      phone: z.string().optional(),
    }).optional(),
    paymentMethod: z.enum(["cod", "online", "wallet", "razorpay"]).default("cod"),
    couponCode: z.string().optional(),
    deliveryPhone: z.string().optional(),
    orderType: z.enum(["delivery", "pickup"]).default("delivery"),
    pickupTime: z.string().optional(),
  }),
});

export const verifyPaymentSchema = z.object({
  body: z.object({
    razorpay_order_id: z.string().min(1, "Razorpay Order ID is required"),
    razorpay_payment_id: z.string().min(1, "Razorpay Payment ID is required"),
    razorpay_signature: z.string().min(1, "Razorpay Signature is required"),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({ orderId: mongoId }),
  body: z.object({
    status: z.enum([
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ]),
  }),
});

export const assignDriverSchema = z.object({
  params: z.object({ orderId: mongoId }),
  body: z.object({
    driverId: mongoId,
  }),
});

export const cancelOrderSchema = z.object({
  params: z.object({ orderId: mongoId }),
  body: z.object({
    reason: z.string().min(3, "Cancellation reason is required"),
  }).optional(),
});