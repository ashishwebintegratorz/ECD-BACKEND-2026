import { Schema, model, Document, Types } from "mongoose";

export interface IInvoice extends Document {
    invoiceNumber: string;
    order: Types.ObjectId;
    customer: Types.ObjectId;
    amount: number;
    paymentMethod?: string;
    date: Date;
    status: "paid" | "unpaid";
}

const InvoiceSchema = new Schema<IInvoice>(
    {
        invoiceNumber: { type: String, required: true, unique: true },
        order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
        customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
        amount: { type: Number, required: true },
        paymentMethod: { type: String },
        date: { type: Date, default: Date.now },
        status: { type: String, enum: ["paid", "unpaid"], default: "paid" },
    },
    { timestamps: true }
);

export default model<IInvoice>("Invoice", InvoiceSchema);
