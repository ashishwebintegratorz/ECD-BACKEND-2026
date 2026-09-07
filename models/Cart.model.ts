import { Schema, model, Document, Types } from "mongoose";

export interface ICartItem {
  product: Types.ObjectId;
  variantIndex?: number; // index into product.variants array OR variant id if you change schema
  qty: number;
  priceAtAdd: number;
  name?: string;
  image?: string;
  portion?: string;
}

export interface ICart extends Document {
  user: Types.ObjectId;
  items: ICartItem[];
  updatedAt: Date;
  createdAt: Date;
}

const CartItemSchema = new Schema<ICartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: false },
    variantIndex: { type: Number },
    qty: { type: Number, default: 1 },
    priceAtAdd: { type: Number, required: true },
    name: { type: String },
    image: { type: String },
    portion: { type: String, default: "Full" },
  },
  { _id: false }
);

const CartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

export default model<ICart>("Cart", CartSchema);
