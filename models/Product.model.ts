import { Schema, model, Document, Types } from "mongoose";

export interface IProductVariant {
  sku?: string;
  unit?: string; // e.g., "1kg", "500g", "piece"
  price: number;
  mrp?: number;
  stock: number;
  images?: string[];
  attributes?: Record<string, any>; // size/color, etc.
}

export interface IProduct extends Document {
  name: string;
  slug?: string;
  description?: string;
  categories?: Types.ObjectId[];
  variants: IProductVariant[];
  isActive: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const VariantSchema = new Schema<IProductVariant>(
  {
    sku: { type: String, index: true },
    unit: { type: String },
    price: { type: Number, required: true },
    mrp: { type: Number },
    stock: { type: Number, default: 0 },
    images: { type: [String], default: [] },
    attributes: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, index: true },
    slug: { type: String, index: true, unique: true, sparse: true },
    description: { type: String },
    categories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    variants: { type: [VariantSchema], default: [] },
    isActive: { type: Boolean, default: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

// useful index for price-based queries or category listing
ProductSchema.index({ "variants.price": 1 });
ProductSchema.index({ categories: 1, isActive: 1 });

export default model<IProduct>("Product", ProductSchema);
