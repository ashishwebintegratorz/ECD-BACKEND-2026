import { Schema, model, Document, Types } from "mongoose";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "cancelled"
  | "failed";

export type DeliveryStatus =
  | "pending"
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
  orderNumber: string; // unique human readable ID
  customer: Types.ObjectId;
  items: IOrderItem[];
  totalAmount: number;
  payableAmount: number;
  address: Types.ObjectId | any; // denormalized address snapshot or ref
  status: OrderStatus;
  deliveryStatus: DeliveryStatus;
  assignedDriver?: Types.ObjectId;
  assignmentId?: Types.ObjectId; // reference to Assignment
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
    items: { type: [OrderItemSchema], required: true },
    totalAmount: { type: Number, required: true },
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
