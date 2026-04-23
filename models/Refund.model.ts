import { Schema, model, Document, Types } from "mongoose";

export type RefundStatus = "pending" | "processing" | "completed" | "failed";
export type RefundInitiator = "customer" | "restaurant" | "admin";

export interface IRefund extends Document {
    order: Types.ObjectId;
    orderNumber: string;
    customer: Types.ObjectId;
    amount: number;
    reason: string;
    initiatedBy: RefundInitiator;
    paymentMethod: string;           // "razorpay" | "cod"
    razorpayPaymentId?: string;           // original payment ID for Razorpay refunds
    razorpayRefundId?: string;           // returned by Razorpay after refund
    status: RefundStatus;
    scheduledAt: Date;             // when refund should be processed
    processedAt?: Date;
    failureReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const RefundSchema = new Schema<IRefund>(
    {
        order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
        orderNumber: { type: String, required: true },
        customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        amount: { type: Number, required: true },
        reason: { type: String, required: true },
        initiatedBy: { type: String, enum: ["customer", "restaurant", "admin"], required: true },
        paymentMethod: { type: String, required: true },
        razorpayPaymentId: { type: String },
        razorpayRefundId: { type: String },
        status: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending", index: true },
        scheduledAt: { type: Date, required: true },
        processedAt: { type: Date },
        failureReason: { type: String },
    },
    { timestamps: true }
);

RefundSchema.index({ status: 1, scheduledAt: 1 }); // for cron queries
RefundSchema.index({ customer: 1, createdAt: -1 });

export default model<IRefund>("Refund", RefundSchema);
