import { Schema, model, Document, Types } from "mongoose";

export type PaymentStatus = "initiated" | "success" | "failed" | "refunded";

export interface IPaymentTransaction extends Document {
  order: Types.ObjectId;
  provider: string; // e.g., "razorpay", "paytm", "cod"
  providerPaymentId?: string;
  amount: number;
  status: PaymentStatus;
  meta?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    provider: { type: String, required: true },
    providerPaymentId: { type: String },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["initiated", "success", "failed", "refunded"], default: "initiated", index: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default model<IPaymentTransaction>("PaymentTransaction", PaymentTransactionSchema);
