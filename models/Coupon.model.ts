import { Schema, model, Document, Types } from "mongoose";

export interface ICoupon extends Document {
  code: string;
  description?: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minOrderValue?: number;
  maxDiscountValue?: number;
  usageLimit?: number;
  usedCount: number;
  perUserLimit?: number;
  validFrom?: Date;
  validTo?: Date;
  active: boolean;
  restaurantId?: Types.ObjectId; // if set, coupon is restaurant-specific
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
    usedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number },
    validFrom: { type: Date },
    validTo: { type: Date },
    active: { type: Boolean, default: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", default: null },
  },
  { timestamps: true }
);

export default model<ICoupon>("Coupon", CouponSchema);
