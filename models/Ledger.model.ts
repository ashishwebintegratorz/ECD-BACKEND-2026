import { Schema, model, Document, Types } from "mongoose";

export type LedgerParty = "store" | "driver" | "platform";
export type LedgerStatus = "pending" | "paid" | "failed";

/**
 * One ledger entry per order per party.
 * Created immediately when payment is confirmed.
 * Paid out via cron jobs (restaurant weekly, driver monthly).
 */
export interface ILedger extends Document {
    order: Types.ObjectId;
    orderNumber: string;           // denormalized for easy queries
    party: LedgerParty;      // who this entry belongs to
    partyRef: Types.ObjectId;   // restaurant._id or user._id (driver)
    amount: number;           // amount owed to this party
    status: LedgerStatus;
    paidAt?: Date;
    payoutBatch?: string;          // e.g. "2026-W18" or "2026-05" for traceability
    createdAt: Date;
    updatedAt: Date;
}

const LedgerSchema = new Schema<ILedger>(
    {
        order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
        orderNumber: { type: String, required: true },
        party: { type: String, enum: ["store", "driver", "platform"], required: true },
        partyRef: { type: Schema.Types.ObjectId, required: true, index: true },
        amount: { type: Number, required: true },
        status: { type: String, enum: ["pending", "paid", "failed"], default: "pending", index: true },
        paidAt: { type: Date },
        payoutBatch: { type: String },
    },
    { timestamps: true }
);

// Compound indexes for cron queries
LedgerSchema.index({ party: 1, status: 1, createdAt: -1 });
LedgerSchema.index({ partyRef: 1, party: 1, status: 1 });

export default model<ILedger>("Ledger", LedgerSchema);
