import { Schema, model, Document, Types } from "mongoose";

export interface IInvoiceItem {
    name: string;
    qty: number;
    price: number;
    subtotal: number;
}

export interface IInvoice extends Document {
    invoiceNumber: string;
    order: Types.ObjectId;
    customer: Types.ObjectId;
    store: Types.ObjectId;         // generic — restaurant or grocery store
    items: IInvoiceItem[];
    totalAmount: number;          // items total before delivery
    deliveryCharge: number;       // delivery fee
    amount: number;               // final payable (totalAmount + deliveryCharge)
    paymentMethod?: string;
    date: Date;
    status: "paid" | "unpaid";
    createdAt: Date;
    updatedAt: Date;
}

const InvoiceItemSchema = new Schema<IInvoiceItem>(
    {
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        price: { type: Number, required: true },
        subtotal: { type: Number, required: true },
    },
    { _id: false }
);

const InvoiceSchema = new Schema<IInvoice>(
    {
        invoiceNumber: { type: String, required: true, unique: true, index: true },
        order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
        customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        store: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
        items: { type: [InvoiceItemSchema], default: [] },
        totalAmount: { type: Number, required: true },
        deliveryCharge: { type: Number, required: true, default: 0 },
        amount: { type: Number, required: true },
        paymentMethod: { type: String },
        date: { type: Date, default: Date.now },
        status: { type: String, enum: ["paid", "unpaid"], default: "paid" },
    },
    { timestamps: true }
);

InvoiceSchema.index({ customer: 1, createdAt: -1 });

export default model<IInvoice>("Invoice", InvoiceSchema);
