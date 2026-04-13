import { Schema, model, Document, Types } from "mongoose";

export interface ICoupon extends Document {
  code: string;
  description?: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minOrderValue?: number;
  maxDiscountValue?: number;
  usageLimit?: number;
  perUserLimit?: number;
  validFrom?: Date;
  validTo?: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    discountType: { type: String, enum: ["percent", "fixed"], required: true },
    discountValue: { type: Number, required: true },
    minOrderValue: { type: Number },
    maxDiscountValue: { type: Number },
    usageLimit: { type: Number },
    perUserLimit: { type: Number },
    validFrom: { type: Date },
    validTo: { type: Date },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<ICoupon>("Coupon", CouponSchema);
