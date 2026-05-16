import { Schema, model, Document, Types } from "mongoose";

export type WithdrawalStatus = "pending" | "approved" | "rejected";

export interface IWithdrawalRequest extends Document {
    driver: Types.ObjectId;
    amount: number;
    status: WithdrawalStatus;
    adminNote?: string;
    processedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const WithdrawalRequestSchema = new Schema<IWithdrawalRequest>(
    {
        driver: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        amount: { type: Number, required: true, min: 1 },
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
        adminNote: { type: String },
        processedAt: { type: Date },
    },
    { timestamps: true }
);

export default model<IWithdrawalRequest>("WithdrawalRequest", WithdrawalRequestSchema);
