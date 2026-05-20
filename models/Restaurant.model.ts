import { Schema, model, Document } from "mongoose";

export type FoodType = "veg" | "non-veg" | "vegan";
export type StoreType = "restaurant" | "grocery";

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
    storeType: StoreType;          // "restaurant" | "grocery"
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
    menu: IMenuItem[];             // used by restaurants; grocery uses Product catalog
    categories?: string[];         // e.g. ["Indian", "Biryani"]
    isActive: boolean;
    restaurantKey: string;         // 14-digit login code
    adminRating: number;
    featured: boolean;
    orderCount: number;
    walletBalance: number;         // Current bucket/earnings balance
    paymentQr?: string;            // QR code image URL for payments
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
        storeType: { type: String, enum: ["restaurant", "grocery"], default: "restaurant", index: true },
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
        categories: { type: [String], default: [], index: true },
        isActive: { type: Boolean, default: true, index: true },
        restaurantKey: { type: String, required: true, unique: true },
        adminRating: { type: Number, default: 0, min: 0, max: 5 },
        featured: { type: Boolean, default: false, index: true },
        orderCount: { type: Number, default: 0 },
        walletBalance: { type: Number, default: 0 },
        paymentQr: { type: String },
    },
    { timestamps: true }
);

RestaurantSchema.index({ location: "2dsphere" });
RestaurantSchema.index({ isActive: 1, storeType: 1, featured: -1, adminRating: -1, orderCount: -1 });

export default model<IRestaurant>("Restaurant", RestaurantSchema);
