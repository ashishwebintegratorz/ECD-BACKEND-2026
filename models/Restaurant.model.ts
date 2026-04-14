import { Schema, model, Document } from "mongoose";

export type FoodType = "veg" | "non-veg" | "vegan";

export interface IMenuItem {
    name: string;
    description?: string;
    price: number;
    image?: string;
    foodType: FoodType;
    isAvailable: boolean;
}

export interface IRestaurant extends Document {
    name: string;
    slug: string;
    description?: string;
    address: string;
    location: {
        type: "Point";
        coordinates: [number, number]; // [lng, lat]
    };
    phone?: string;
    email?: string;
    logo?: string;
    coverImage?: string;
    menu: IMenuItem[];
    isActive: boolean;
    adminRating: number;   // 0–5, set only by admin
    featured: boolean;     // admin-controlled boost flag
    orderCount: number;    // incremented on each completed order
    createdAt: Date;
    updatedAt: Date;
}

const MenuItemSchema = new Schema<IMenuItem>(
    {
        name: { type: String, required: true },
        description: { type: String },
        price: { type: Number, required: true },
        image: { type: String },
        foodType: { type: String, enum: ["veg", "non-veg", "vegan"], required: true },
        isAvailable: { type: Boolean, default: true },
    },
    { _id: true }
);

const RestaurantSchema = new Schema<IRestaurant>(
    {
        name: { type: String, required: true, index: true },
        slug: { type: String, required: true, unique: true, index: true },
        description: { type: String },
        address: { type: String, required: true },
        location: {
            type: { type: String, enum: ["Point"], default: "Point" },
            coordinates: {
                type: [Number],
                required: true,
                validate: {
                    validator: (v: number[]) => v.length === 2,
                    message: "Coordinates must be [lng, lat]",
                },
            },
        },
        phone: { type: String },
        email: { type: String },
        logo: { type: String },
        coverImage: { type: String },
        menu: { type: [MenuItemSchema], default: [] },
        isActive: { type: Boolean, default: true, index: true },
        adminRating: { type: Number, default: 0, min: 0, max: 5 },
        featured: { type: Boolean, default: false, index: true },
        orderCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

RestaurantSchema.index({ location: "2dsphere" });
RestaurantSchema.index({ isActive: 1, featured: -1, adminRating: -1, orderCount: -1 });

export default model<IRestaurant>("Restaurant", RestaurantSchema);
