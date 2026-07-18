import { Schema, model, Document, Types } from "mongoose";

export interface ICodSettlement extends Document {
    driver: Types.ObjectId;
    amount: number;
    type: "full" | "manual";
    settledAt: Date;
}

const CodSettlementSchema = new Schema<ICodSettlement>({
    driver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["full", "manual"], required: true },
    settledAt: { type: Date, default: Date.now },
});

export default model<ICodSettlement>("CodSettlement", CodSettlementSchema);
