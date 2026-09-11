import mongoose, { Schema, model, Document, Types } from "mongoose";

export type OrderStatus =
  | "pending"
  | "preparing"   // auto-set when payment confirmed — restaurant starts immediately
  | "ready"       // restaurant marks done, rider notified
  | "picked_up"
  | "delivered"
  | "cancelled"
  | "failed";

export type DeliveryStatus =
  | "pending"
  | "driver_notified"   // driver notified, awaiting acceptance
  | "accepted"          // driver accepted
  | "assigned"
  | "reached_store"     // driver at restaurant
  | "picked_up"         // driver collected the food
  | "out_for_delivery"
  | "delivered"
  | "self_pickup"       // no driver involved
  | "cancelled"
  | "failed";

export type CancelledBy = "customer" | "restaurant" | "driver" | "admin";

// ── Embedded cancellation log entry ─────────────────────────────────────────
export interface ICancellationLog {
  cancelledBy: CancelledBy;
  cancelledByUser: Types.ObjectId;
  reason: string;
  cancelledAt: Date;
}

export interface IOrderItem {
  product: Types.ObjectId;
  name?: string;
  image?: string;
  portion?: string;
  variantIndex?: number;
  qty: number;
  price: number;
  subtotal: number;
}

export type OrderType = "delivery" | "pickup";

export interface IOrder extends Document {
  orderNumber: string;
  orderType: OrderType;
  pickupTime?: string;
  customer: Types.ObjectId;
  store: Types.ObjectId;         // generic ref — works for both restaurant and grocery
  cityId?: Types.ObjectId;       // Ref to City
  zoneId?: Types.ObjectId;       // Ref to DeliveryZone
  deliveryCoordinates?: {
    lat: number;
    lng: number;
  };
  items: IOrderItem[];
  totalAmount: number;
  deliveryCharge: number;
  gst: number;
  totalDiscount: number;
  payableAmount: number;
  address: Types.ObjectId | any;
  status: OrderStatus;
  deliveryStatus: DeliveryStatus;
  assignedDriver?: Types.ObjectId;
  rejectedDrivers: Types.ObjectId[];
  assignmentId?: Types.ObjectId;
  paymentTransaction?: Types.ObjectId;
  deliveryPhone?: string;
  cancellationReason?: string;
  cancelledBy?: CancelledBy;
  cancellationLog: ICancellationLog[];
  coupon?: { couponId: Types.ObjectId; code: string; discountAmount: number }; // applied coupon
  pickupOtp?: string;            // OTP given by restaurant to rider for pickup
  deliveryOTP?: string;          // OTP given by customer to rider for delivery
  acceptedAt?: Date;
  readyAt?: Date;
  deliveredAt?: Date;
  assignmentTimeoutAt?: Date;
  meta?: Record<string, any>;
  driverEarnings?: number;       // Rider's calculated pay (5 rs per km)
  restaurantEarnings?: number;   // Restaurant's business cut (50%)
  riderAdminCommission?: number; // Admin's commission from rider
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: false },
    name: { type: String },
    image: { type: String },
    portion: { type: String, default: "Full" },
    variantIndex: { type: Number },
    qty: { type: Number, default: 1 },
    price: { type: Number, required: true },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const CancellationLogSchema = new Schema<ICancellationLog>(
  {
    cancelledBy: { type: String, enum: ["customer", "restaurant", "driver", "admin"], required: true },
    cancelledByUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true },
    cancelledAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    orderType: { type: String, enum: ["delivery", "pickup"], default: "delivery" },
    pickupTime: { type: String },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    store: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    cityId: { type: Schema.Types.ObjectId, ref: "City", index: true },
    zoneId: { type: Schema.Types.ObjectId, ref: "DeliveryZone", index: true },
    deliveryCoordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    items: { type: [OrderItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    deliveryCharge: { type: Number, required: true, default: 0 },
    gst: { type: Number, required: true, default: 0 },
    totalDiscount: { type: Number, required: true, default: 0 },
    payableAmount: { type: Number, required: true },
    address: { type: Schema.Types.Mixed, required: true },
    status: { type: String, default: "pending", index: true },
    deliveryStatus: { type: String, default: "pending", index: true },
    assignedDriver: { type: Schema.Types.ObjectId, ref: "User" },
    rejectedDrivers: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment" },
    paymentTransaction: { type: Schema.Types.ObjectId, ref: "PaymentTransaction" },
    deliveryPhone: { type: String },
    cancellationReason: { type: String },
    cancelledBy: { type: String, enum: ["customer", "restaurant", "driver", "admin"] },
    cancellationLog: { type: [CancellationLogSchema], default: [] },
    coupon: {
      couponId: { type: Schema.Types.ObjectId, ref: "Coupon" },
      code: { type: String },
      discountAmount: { type: Number },
    },
    pickupOtp: { type: String },
    deliveryOTP: { type: String },
    acceptedAt: { type: Date },
    readyAt: { type: Date },
    deliveredAt: { type: Date },
    assignmentTimeoutAt: { type: Date },
    meta: { type: Schema.Types.Mixed },
    driverEarnings: { type: Number, default: 0 },
    restaurantEarnings: { type: Number, default: 0 },
    riderAdminCommission: { type: Number, default: 0 },
  },
  { timestamps: true }
);

OrderSchema.index({ customer: 1, createdAt: -1 });
OrderSchema.index({ cityId: 1, zoneId: 1, status: 1 });
OrderSchema.index({ status: 1, assignedDriver: 1 });
OrderSchema.index({ deliveryStatus: 1, assignedDriver: 1 });
OrderSchema.index({ cancelledBy: 1, createdAt: -1 }); // admin cancellation queries

export default (mongoose.models.Order as mongoose.Model<IOrder>) || model<IOrder>("Order", OrderSchema);
