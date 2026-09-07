import { Schema, model, Document } from "mongoose";

export type FoodType = "veg" | "non-veg" | "vegan";
export type StoreType = "restaurant" | "grocery";

export interface IPortion {
    name: string;                  // e.g. "Full", "Half", "Quarter", "1 Pc", "Medium"
    price?: number;                // Selling price for this portion
    b2bPrice?: number;             // B2B cost for this portion
    isDefault?: boolean;           // Default selection flag
}

export interface IMenuItem {
    name: string;
    description?: string;
    price: number;                 // Selling Price (visible to users)
    b2bPrice?: number;             // Business to Business Price (internal cost)
    portion?: string;              // Primary / default portion string e.g. "Full"
    portions?: IPortion[];         // Multiple selectable portion variants
    image?: string;
    foodType: FoodType;
    isAvailable: boolean;
    approvalStatus?: "pending" | "approved" | "rejected" | "delete_pending" | "deleted";
    deleteReason?: string;
}

export interface IRestaurant extends Document {
    name: string;
    slug: string;
    restaurantId: string;          // 14-digit custom ID
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
    accountDetail?: string;        // Bank passbook image URL
    menu: IMenuItem[];             // used by restaurants; grocery uses Product catalog
    categories?: string[];         // e.g. ["Indian", "Biryani"]
    isActive: boolean;             // Admin active/blocked status
    isOnline: boolean;             // Vendor online/offline status
    restaurantKey: string;         // 14-digit login code
    adminRating: number;
    avgRating: number;
    totalReviews: number;
    featured: boolean;
    orderCount: number;
    walletBalance: number;         // Current bucket/earnings balance
    upi?: string;                  // UPI ID for payouts
    paymentQr?: string;            // QR code image URL for payments
    createdAt: Date;
    updatedAt: Date;
}

const MenuItemSchema = new Schema<IMenuItem>(
    {
        name: { type: String, required: true },
        description: { type: String },
        price: { type: Number, required: true },
        b2bPrice: { type: Number, default: 0 },
        portion: { type: String, default: "Full" },
        portions: [
            {
                name: { type: String, default: "Full" },
                price: { type: Number, default: 0 },
                b2bPrice: { type: Number, default: 0 },
                isDefault: { type: Boolean, default: false },
            },
        ],
        image: { type: String },
        foodType: { type: String, enum: ["veg", "non-veg", "vegan"], required: true },
        isAvailable: { type: Boolean, default: true },
        approvalStatus: { type: String, enum: ["pending", "approved", "rejected", "delete_pending", "deleted"], default: "approved" },
        deleteReason: { type: String },
    },
    { _id: true }
);

const RestaurantSchema = new Schema<IRestaurant>(
    {
        name: { type: String, required: true, index: true },
        slug: { type: String, required: true, unique: true, index: true },
        restaurantId: { type: String, required: true, unique: true, index: true },
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
        accountDetail: { type: String },
        menu: { type: [MenuItemSchema], default: [] },
        categories: { type: [String], default: [], index: true },
        isActive: { type: Boolean, default: true, index: true },
        isOnline: { type: Boolean, default: false, index: true },
        restaurantKey: { type: String, required: true, unique: true },
        adminRating: { type: Number, default: 0, min: 0, max: 5 },
        avgRating: { type: Number, default: 0, min: 0, max: 5 },
        totalReviews: { type: Number, default: 0 },
        featured: { type: Boolean, default: false, index: true },
        orderCount: { type: Number, default: 0 },
        walletBalance: { type: Number, default: 0 },
        upi: { type: String },
        paymentQr: { type: String },
    },
    { timestamps: true }
);

RestaurantSchema.index({ location: "2dsphere" });
RestaurantSchema.index({ isActive: 1, storeType: 1, featured: -1, adminRating: -1, orderCount: -1 });

export default model<IRestaurant>("Restaurant", RestaurantSchema);
