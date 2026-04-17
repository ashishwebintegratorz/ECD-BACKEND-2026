import { Schema, model, Document, Types } from "mongoose";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "restaurant_confirmed"  // restaurant accepted the order
  | "preparing"
  | "ready"
  | "cancelled"
  | "failed";

export type DeliveryStatus =
  | "pending"
  | "driver_notified"       // driver has been notified, awaiting acceptance
  | "accepted"              // driver accepted the order
  | "assigned"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "failed";

export interface IOrderItem {
  product: Types.ObjectId;
  name?: string;
  variantIndex?: number;
  qty: number;
  price: number; // final price per unit at time of order
  subtotal: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  customer: Types.ObjectId;
  restaurant: Types.ObjectId;   // which restaurant this order belongs to
  items: IOrderItem[];
  totalAmount: number;
  deliveryCharge: number;       // delivery fee at time of order
  payableAmount: number;
  address: Types.ObjectId | any;
  status: OrderStatus;
  deliveryStatus: DeliveryStatus;
  assignedDriver?: Types.ObjectId;
  assignmentId?: Types.ObjectId;
  paymentTransaction?: Types.ObjectId;
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

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    items: { type: [OrderItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    deliveryCharge: { type: Number, required: true, default: 0 },
    payableAmount: { type: Number, required: true },
    address: { type: Schema.Types.Mixed, required: true }, // store snapshot: {fullAddress, location, phone}
    status: { type: String, default: "pending", index: true },
    deliveryStatus: { type: String, default: "pending", index: true },
    assignedDriver: { type: Schema.Types.ObjectId, ref: "User" },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment" },
    paymentTransaction: { type: Schema.Types.ObjectId, ref: "PaymentTransaction" },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

OrderSchema.index({ customer: 1, createdAt: -1 });
OrderSchema.index({ status: 1, assignedDriver: 1 });
OrderSchema.index({ deliveryStatus: 1, assignedDriver: 1 });

export default model<IOrder>("Order", OrderSchema);
