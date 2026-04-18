import { Schema, model, Document, Types } from "mongoose";

export type OrderStatus =
  | "pending"
  | "preparing"   // auto-set when payment confirmed — restaurant starts immediately
  | "ready"       // restaurant marks done, rider notified
  | "cancelled"
  | "failed";

export type DeliveryStatus =
  | "pending"
  | "driver_notified"   // driver notified, awaiting acceptance
  | "accepted"          // driver accepted
  | "assigned"
  | "out_for_delivery"
  | "delivered"
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
  variantIndex?: number;
  qty: number;
  price: number;
  subtotal: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  customer: Types.ObjectId;
  restaurant: Types.ObjectId;
  items: IOrderItem[];
  totalAmount: number;
  deliveryCharge: number;
  payableAmount: number;
  address: Types.ObjectId | any;
  status: OrderStatus;
  deliveryStatus: DeliveryStatus;
  assignedDriver?: Types.ObjectId;
  assignmentId?: Types.ObjectId;
  paymentTransaction?: Types.ObjectId;
  // Cancellation — stored directly on the order, no separate collection needed
  cancellationReason?: string;
  cancelledBy?: CancelledBy;
  cancellationLog: ICancellationLog[]; // full history (driver declines, etc.)
  meta?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String },
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
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    items: { type: [OrderItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    deliveryCharge: { type: Number, required: true, default: 0 },
    payableAmount: { type: Number, required: true },
    address: { type: Schema.Types.Mixed, required: true },
    status: { type: String, default: "pending", index: true },
    deliveryStatus: { type: String, default: "pending", index: true },
    assignedDriver: { type: Schema.Types.ObjectId, ref: "User" },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment" },
    paymentTransaction: { type: Schema.Types.ObjectId, ref: "PaymentTransaction" },
    cancellationReason: { type: String },
    cancelledBy: { type: String, enum: ["customer", "restaurant", "driver", "admin"] },
    cancellationLog: { type: [CancellationLogSchema], default: [] },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

OrderSchema.index({ customer: 1, createdAt: -1 });
OrderSchema.index({ status: 1, assignedDriver: 1 });
OrderSchema.index({ deliveryStatus: 1, assignedDriver: 1 });
OrderSchema.index({ cancelledBy: 1, createdAt: -1 }); // admin cancellation queries

export default model<IOrder>("Order", OrderSchema);
