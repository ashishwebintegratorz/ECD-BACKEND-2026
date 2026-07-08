import { Request, Response } from "express";
import Restaurant from "../models/Restaurant.model.js";
import Product from "../models/Product.model.js";
import Category from "../models/Category.model.js";
import Order from "../models/Order.model.js";
import { NotFoundException, BadRequestException } from "../utils/appError.js";
import { slugify } from "../validators/restaurant.validator.js";
import { Types } from "mongoose";
import { createAndSendOtp, verifyOtp } from "../services/otp.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Ranking score — adminRating is primary, featured is a hard boost
// Score = (featured ? 10 : 0) + adminRating*2 + log(orderCount+1) - distanceKm*0.1
const rankScore = (
    adminRating: number,
    orderCount: number,
    featured: boolean,
    distanceKm: number
): number =>
    (featured ? 10 : 0) +
    adminRating * 2 +
    Math.log(orderCount + 1) -
    distanceKm * 0.1;

// Haversine distance in km between two [lng, lat] pairs
const haversineKm = (
    [lng1, lat1]: [number, number],
    [lng2, lat2]: [number, number]
): number => {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    let dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Cap distance for remote testing
    if (dist > 15) {
        dist = 2.5 + (Math.random() * 5); // Random distance between 2.5 and 7.5 km
    }
    return dist;
};

const toObjectId = (id: string) => new Types.ObjectId(id as string);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/restaurants/list
// Query: ?page=1&limit=10&search=&lat=&lng=
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurants = async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 50)); // cap at 1000
    const search = (req.query.search as string) || "";
    const storeType = (req.query.storeType as string) || "";
    const userLat = req.query.lat ? Number(req.query.lat) : null;
    const userLng = req.query.lng ? Number(req.query.lng) : null;
    const hasCoords = userLat !== null && userLng !== null;

    const filter: any = { isActive: true };
    if (storeType) filter.storeType = storeType;
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
        ];
    }

    // When no coords: sort entirely in DB — fast, uses compound index
    if (!hasCoords) {
        const [restaurants, total] = await Promise.all([
            Restaurant.find(filter)
                .select("-menu")
                .sort({ featured: -1, adminRating: -1, orderCount: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Restaurant.countDocuments(filter),
        ]);

        return res.json({
            restaurants,
            total,
            totalPages: Math.ceil(total / limit),
            page,
            limit,
        });
    }

    // When coords provided: fetch all, rank in-memory with distance penalty
    // Acceptable for single-city scale (few hundred restaurants max)
    const restaurants = await Restaurant.find(filter).select("-menu").lean();

    const ranked = restaurants
        .map((r) => {
            const distanceKm = haversineKm(
                [userLng!, userLat!],
                r.location.coordinates as [number, number]
            );
            return {
                ...r,
                distanceKm: Math.round(distanceKm * 10) / 10,
                // _score intentionally excluded from response below
            };
        })
        .sort((a, b) => {
            const scoreA = rankScore(a.adminRating, a.orderCount, a.featured, a.distanceKm);
            const scoreB = rankScore(b.adminRating, b.orderCount, b.featured, b.distanceKm);
            return scoreB - scoreA;
        });

    const total = ranked.length;
    const paginated = ranked.slice((page - 1) * limit, page * limit);

    return res.json({
        restaurants: paginated,
        total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/restaurants/search?query=biryani
// ─────────────────────────────────────────────────────────────────────────────
export const searchRestaurants = async (req: Request, res: Response) => {
    const query = (req.query.query as string) || (req.query.search as string) || "";
    if (!query) {
        return res.json({ success: true, restaurants: [] });
    }

    const regex = new RegExp(query, "i");

    // Search in Restaurant: Name, Categories (string array), Menu Items
    const restaurants = await Restaurant.find({
        isActive: true,
        $or: [
            { name: { $regex: regex } },
            { categories: { $regex: regex } },
            { "menu.name": { $regex: regex } },
            { description: { $regex: regex } },
        ],
    })
        .select("name slug description address location logo coverImage categories adminRating featured orderCount menu")
        .sort({ featured: -1, adminRating: -1, orderCount: -1 })
        .limit(50)
        .lean();

    return res.json({
        success: true,
        count: restaurants.length,
        restaurants,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/restaurants/by-category/:slug
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantsByCategory = async (req: Request, res: Response) => {
    const slug = String(req.params.slug);

    // 1. Find the category to get its name
    const category = await Category.findOne({ slug });

    // 2. Search restaurants that have this category name or matching items
    const categoryName = category ? category.name : "";
    const query = categoryName || slug;
    const regex = new RegExp(query, "i");

    const restaurants = await Restaurant.find({
        isActive: true,
        $or: [
            { categories: { $regex: regex } },
            { "menu.name": { $regex: regex } }
        ]
    })
        .sort({ featured: -1, adminRating: -1, orderCount: -1 })
        .limit(50)
        .lean();

    return res.json({
        success: true,
        category: category?.name || slug,
        count: restaurants.length,
        restaurants
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/restaurants/suggestions?query=biry
// ─────────────────────────────────────────────────────────────────────────────
export const getSuggestions = async (req: Request, res: Response) => {
    const query = (req.query.query as string) || "";
    if (!query || query.length < 2) {
        return res.json({ suggestions: [] });
    }

    const regex = new RegExp(query, "i");

    // 1. Find matching restaurant names
    const restaurantMatches = await Restaurant.find({
        isActive: true,
        name: regex,
    })
        .select("name logo slug")
        .limit(5)
        .lean();

    // 2. Find matching items (from Restaurant menu AND Product collection)
    const [menuItemMatches, productMatches] = await Promise.all([
        Restaurant.aggregate([
            { $match: { isActive: true } },
            { $unwind: "$menu" },
            { $match: { "menu.name": regex, "menu.isAvailable": true } },
            { $group: { _id: "$menu.name" } },
            { $limit: 5 },
        ]),
        Product.find({
            name: regex,
            isActive: true,
        })
            .distinct("name")
            .then((names) => names.slice(0, 5)),
    ]);

    // 3. Find matching categories
    const categoryMatches = await Restaurant.distinct("categories", {
        isActive: true,
        categories: regex,
    });

    // Combine and Deduplicate item suggestions
    const itemSuggestions = Array.from(new Set([...menuItemMatches.map((i) => i._id), ...productMatches])).slice(0, 7);

    const suggestions = [
        ...restaurantMatches.map((r) => ({
            type: "restaurant",
            text: r.name,
            slug: r.slug,
            logo: r.logo,
        })),
        ...itemSuggestions.map((text) => ({
            type: "item",
            text,
        })),
        ...categoryMatches.slice(0, 5).map((c) => ({
            type: "category",
            text: c,
        })),
    ];

    return res.json({
        success: true,
        suggestions,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/restaurants/details/:slug
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantBySlug = async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const restaurant = await Restaurant.findOne({
        slug,
        isActive: true,
    }).lean();

    if (!restaurant) throw new NotFoundException("Restaurant not found");

    // Group available menu items by foodType and hide b2bPrice
    const groupedMenu: Record<string, typeof restaurant.menu> = {};
    for (const item of restaurant.menu) {
        if (!item.isAvailable) continue;

        // Hide internal B2B price from public users
        delete (item as any).b2bPrice;

        if (!groupedMenu[item.foodType]) groupedMenu[item.foodType] = [];
        groupedMenu[item.foodType].push(item);
    }

    return res.json({
        restaurant: {
            _id: restaurant._id,
            name: restaurant.name,
            slug: restaurant.slug,
            storeType: restaurant.storeType,  // "restaurant" | "grocery"
            description: restaurant.description,
            address: restaurant.address,
            location: restaurant.location,
            phone: restaurant.phone,
            email: restaurant.email,
            logo: restaurant.logo,
            coverImage: restaurant.coverImage,
            adminRating: restaurant.adminRating,
            featured: restaurant.featured,
            orderCount: restaurant.orderCount,
            createdAt: restaurant.createdAt,
        },
        menu: groupedMenu, // { veg: [...], "non-veg": [...], vegan: [...] }
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/restaurants/menu/:slug?foodType=veg|non-veg|vegan
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantMenu = async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const foodType = req.query.foodType as string | undefined;
    const query: any = { isActive: true };
    if (typeof slug === "string" && Types.ObjectId.isValid(slug)) {
        query.$or = [{ slug }, { _id: new Types.ObjectId(slug) }];
    } else {
        query.slug = slug;
    }
    const restaurant = await Restaurant.findOne(query, { menu: 1 }).lean();

    if (!restaurant) throw new NotFoundException("Restaurant not found");

    let menu = restaurant.menu.filter((item) => item.isAvailable);
    if (foodType) menu = menu.filter((item) => item.foodType === foodType);

    // Hide internal B2B price from public users
    menu.forEach(item => delete (item as any).b2bPrice);

    return res.json({ menu });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /api/restaurants/admin/create
// ─────────────────────────────────────────────────────────────────────────────
export const createRestaurant = async (req: Request, res: Response) => {
    // Check onboarding limit
    const totalRestaurants = await Restaurant.countDocuments();
    if (totalRestaurants >= 1000) {
        return res.status(400).json({ success: false, message: "Restaurant onboarding limit reached. Maximum 1000 restaurants allowed." });
    }

    const { name, description, address, phone, email, logo, coverImage, accountDetail, lat, lng, categories, upi } = req.body;

    // Auto-generate slug if not provided, ensure uniqueness
    let slug: string = req.body.slug ? req.body.slug : slugify(name);
    const existing = await Restaurant.findOne({ slug });
    if (existing) {
        // append short unique suffix to avoid collision
        slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Generate 14-digit key if not provided
    let restaurantKey = req.body.restaurantKey;
    if (!restaurantKey) {
        restaurantKey = '';
        for (let i = 0; i < 14; i++) restaurantKey += Math.floor(Math.random() * 10).toString();
    }

    // Generate 14-digit custom ID if not provided
    let restaurantId = req.body.restaurantId;
    if (!restaurantId) {
        restaurantId = '';
        for (let i = 0; i < 14; i++) restaurantId += Math.floor(Math.random() * 10).toString();
    }

    const restaurant = await Restaurant.create({
        name,
        slug,
        restaurantId,
        restaurantKey,
        storeType: req.body.storeType ?? "restaurant",
        description,
        address,
        location: { type: "Point", coordinates: [Number(lng), Number(lat)] },
        phone,
        email,
        logo,
        coverImage,
        accountDetail,
        paymentQr: req.body.paymentQr,
        upi,
        categories: categories || [],
    });

    return res.status(201).json({ message: "Restaurant created", restaurant });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /api/restaurants/admin/update/:id
// ─────────────────────────────────────────────────────────────────────────────
export const updateRestaurant = async (req: Request, res: Response) => {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const { name, slug, description, address, phone, email,
        logo, coverImage, accountDetail, isActive, featured, lat, lng, categories, storeType, paymentQr, upi } = req.body;

    if (slug && slug !== restaurant.slug) {
        const taken = await Restaurant.findOne({ slug });
        if (taken) throw new BadRequestException("Slug already in use");
    }

    const location =
        lat !== undefined && lng !== undefined
            ? { type: "Point" as const, coordinates: [Number(lng), Number(lat)] as [number, number] }
            : restaurant.location;

    const updated = await Restaurant.findByIdAndUpdate(
        req.params.id,
        {
            ...(name !== undefined && { name }),
            ...(slug !== undefined && { slug }),
            ...(description !== undefined && { description }),
            ...(address !== undefined && { address }),
            ...(phone !== undefined && { phone }),
            ...(email !== undefined && { email }),
            ...(logo !== undefined && { logo }),
            ...(coverImage !== undefined && { coverImage }),
            ...(accountDetail !== undefined && { accountDetail }),
            ...(isActive !== undefined && { isActive }),
            ...(featured !== undefined && { featured }),
            ...(categories !== undefined && { categories }),
            ...(storeType !== undefined && { storeType }),
            ...(paymentQr !== undefined && { paymentQr }),
            ...(upi !== undefined && { upi }),
            location,
        },
        { new: true, runValidators: true }
    );

    return res.json({ message: "Restaurant updated", restaurant: updated });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PATCH /api/restaurants/admin/set-rating/:id
// ─────────────────────────────────────────────────────────────────────────────
export const setAdminRating = async (req: Request, res: Response) => {
    const restaurant = await Restaurant.findByIdAndUpdate(
        req.params.id,
        { adminRating: Number(req.body.rating) },
        { new: true, runValidators: true } // schema enforces min:0 max:5
    );

    if (!restaurant) throw new NotFoundException("Restaurant not found");

    return res.json({ message: "Rating updated", adminRating: restaurant.adminRating });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: DELETE /api/restaurants/admin/delete/:id
// ─────────────────────────────────────────────────────────────────────────────
export const deleteRestaurant = async (req: Request, res: Response) => {
    const restaurant = await Restaurant.findByIdAndDelete(req.params.id);
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    return res.json({ message: "Restaurant deleted" });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /api/restaurants/admin/menu/add/:id
// ─────────────────────────────────────────────────────────────────────────────
export const addMenuItem = async (req: Request, res: Response) => {
    const { name, description, price, b2bPrice, image, foodType, isAvailable } = req.body;

    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    restaurant.menu.push({
        name,
        description,
        price: Number(price),
        b2bPrice: b2bPrice !== undefined ? Number(b2bPrice) : 0,
        image,
        foodType,
        isAvailable: isAvailable ?? true,
    });
    await restaurant.save();

    return res.status(201).json({ message: "Menu item added", menu: restaurant.menu });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /api/restaurants/admin/menu/update/:id/:itemId
// ─────────────────────────────────────────────────────────────────────────────
export const updateMenuItem = async (req: Request, res: Response) => {
    const { id, itemId } = req.params as { id: string; itemId: string };

    if (!Types.ObjectId.isValid(itemId))
        throw new BadRequestException("Invalid item ID");

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const item = restaurant.menu.find(
        (m) => (m as any)._id.toString() === itemId
    );
    if (!item) throw new NotFoundException("Menu item not found");

    if (req.body.name !== undefined) item.name = req.body.name;
    if (req.body.description !== undefined) item.description = req.body.description;
    if (req.body.price !== undefined) item.price = Number(req.body.price);
    if (req.body.b2bPrice !== undefined) (item as any).b2bPrice = Number(req.body.b2bPrice);
    if (req.body.image !== undefined) item.image = req.body.image;
    if (req.body.foodType !== undefined) item.foodType = req.body.foodType;
    if (req.body.isAvailable !== undefined) item.isAvailable = req.body.isAvailable;

    await restaurant.save();

    return res.json({ message: "Menu item updated", item });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: DELETE /api/restaurants/admin/menu/delete/:id/:itemId
// ─────────────────────────────────────────────────────────────────────────────
export const deleteMenuItem = async (req: Request, res: Response) => {
    const { id, itemId } = req.params as { id: string; itemId: string };

    if (!Types.ObjectId.isValid(itemId))
        throw new BadRequestException("Invalid item ID");

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const before = restaurant.menu.length;
    restaurant.menu = restaurant.menu.filter(
        (m) => (m as any)._id.toString() !== itemId
    ) as any;

    if (restaurant.menu.length === before)
        throw new NotFoundException("Menu item not found");

    await restaurant.save();

    return res.json({ message: "Menu item deleted" });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: PATCH /api/v1/restaurants/:restaurantId/toggle-active
// ─────────────────────────────────────────────────────────────────────────────
export const toggleRestaurantActive = async (req: Request, res: Response) => {
    const { restaurantId } = req.params;
    const { isOnline } = req.body || {};

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
    }

    restaurant.isOnline = isOnline !== undefined ? isOnline : !restaurant.isOnline;
    await restaurant.save();

    return res.json({
        success: true,
        message: `Restaurant is now ${restaurant.isOnline ? "online" : "offline"}`,
        isOnline: restaurant.isOnline,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: POST /api/v1/restaurants/login
// ─────────────────────────────────────────────────────────────────────────────
export const restaurantLogin = async (req: Request, res: Response) => {
    const { restaurantKey } = req.body;

    if (!restaurantKey) {
        return res.status(400).json({ message: "Restaurant key is required" });
    }

    let restaurant = await Restaurant.findOne({ restaurantKey });

    // Auto-create for testing purposes
    if (!restaurant && restaurantKey === "12345678901234") {
        restaurant = new Restaurant({
            name: "Test ECD Restaurant",
            slug: "test-ecd-restaurant-" + Date.now(),
            restaurantId: "98765432109876",
            restaurantKey: "12345678901234",
            storeType: "restaurant",
            status: "active",
            location: { type: "Point", coordinates: [75.8577, 22.7196] },
            address: "Test Address, Indore",
            phone: "9999999999",
            walletBalance: 0,
        });
        await restaurant.save();
    }

    if (!restaurant) {
        return res.status(401).json({ message: "Invalid restaurant key" });
    }

    if (!restaurant.isActive) {
        return res.status(401).json({ message: "Your restaurant account has been blocked. Please contact admin." });
    }

    // Self-healing: if an existing restaurant lacks a restaurantId, generate and save it
    if (!restaurant.restaurantId) {
        let restaurantId = '';
        for (let i = 0; i < 14; i++) restaurantId += Math.floor(Math.random() * 10).toString();
        restaurant.restaurantId = restaurantId;
        await restaurant.save();
    }

    // For the current MVP setup, we use the test token bypass. 
    // In production, sign a proper JWT here.
    return res.json({
        token: "RESTAURANT_TEST_TOKEN",
        _id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        name: restaurant.name,
        logo: restaurant.logo,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: GET /api/v1/restaurants/:restaurantId/profile
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantProfile = async (req: Request, res: Response) => {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
    }

    // Aggregate total completed orders
    const stats = await Order.aggregate([
        {
            $match: {
                store: restaurant._id,
                deliveryStatus: { $in: ["picked_up", "delivered"] }
            }
        },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 }
            }
        }
    ]);

    const totalOrders = stats[0]?.totalOrders || 0;
    const totalRevenue = restaurant.walletBalance; // Real-time bucket balance

    return res.json({
        success: true,
        restaurant: {
            id: restaurant._id,
            restaurantId: restaurant.restaurantId,
            name: restaurant.name,
            logo: restaurant.logo,
            coverImage: restaurant.coverImage,
            restaurantKey: restaurant.restaurantKey,
            isActive: restaurant.isActive,
            menu: restaurant.menu,
        },
        totalOrders,
        totalRevenue,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: GET /api/v1/restaurants/:restaurantId/order-history
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantOrderHistory = async (req: Request, res: Response) => {
    const { restaurantId } = req.params;

    const orders = await Order.find({
        store: restaurantId,
        deliveryStatus: { $in: ["picked_up", "delivered"] },
    })
        .sort({ createdAt: -1 })
        .populate("customer", "name phone")
        .populate("assignedDriver", "name phone")
        .lean();

    return res.json({
        success: true,
        orders,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /api/v1/restaurants/:restaurantId/payout
// ─────────────────────────────────────────────────────────────────────────────
export const payoutRestaurant = async (req: Request, res: Response) => {
    const { restaurantId } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid payout amount" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
    }

    if (restaurant.walletBalance < amount) {
        return res.status(400).json({ message: "Insufficient bucket balance for this payout" });
    }

    restaurant.walletBalance -= amount;
    await restaurant.save();

    return res.json({
        success: true,
        message: `Successfully paid out ₹${amount}`,
        newBalance: restaurant.walletBalance,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: POST /api/v1/restaurants/send-otp
// ─────────────────────────────────────────────────────────────────────────────
export const restaurantSendOtp = async (req: Request, res: Response) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
    }

    const searchPhone = phone.startsWith('+91') ? phone : `+91${phone}`;
    const rawPhone = phone.startsWith('+91') ? phone.replace('+91', '') : phone;
    const restaurant = await Restaurant.findOne({ 
        $or: [
            { phone: searchPhone },
            { phone: rawPhone }
        ]
    });

    if (!restaurant) {
        return res.status(404).json({ message: "No restaurant found with this phone number. Please contact admin to onboard." });
    }

    await createAndSendOtp(searchPhone);
    return res.json({ message: "OTP sent successfully" });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT: POST /api/v1/restaurants/verify-otp
// ─────────────────────────────────────────────────────────────────────────────
export const restaurantVerifyOtp = async (req: Request, res: Response) => {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
        return res.status(400).json({ message: "Phone number and OTP are required" });
    }

    const searchPhone = phone.startsWith('+91') ? phone : `+91${phone}`;
    const rawPhone = phone.startsWith('+91') ? phone.replace('+91', '') : phone;

    const isValid = await verifyOtp(searchPhone, otp);
    if (!isValid) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const restaurant = await Restaurant.findOne({ 
        $or: [
            { phone: searchPhone },
            { phone: rawPhone }
        ]
    });
    if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
    }

    if (!restaurant.isActive) {
        return res.status(401).json({ message: "Your restaurant account has been blocked. Please contact admin." });
    }

    // For the current MVP setup, we use the test token bypass.
    // In production, sign a proper JWT here.
    return res.json({
        token: "RESTAURANT_TEST_TOKEN",
        _id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        message: "Login successful"
    });
};

// "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
// DASHBOARD STATS
// "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
export const getDashboardStats = async (req: Request, res: Response) => {
    const { restaurantId } = req.params;
    const filter = (req.query.filter as string) || "today";

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
    }

    const matchQuery: any = {
        store: restaurant._id,
        deliveryStatus: { $in: ["picked_up", "delivered"] }
    };

    const now = new Date();
    if (filter === "today") {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        matchQuery.createdAt = { $gte: startOfDay };
    } else if (filter === "7_days") {
        const startOf7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchQuery.createdAt = { $gte: startOf7Days };
    } else if (filter === "1_month") {
        const startOf30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        matchQuery.createdAt = { $gte: startOf30Days };
    }

    const stats = await Order.aggregate([
        {
            $match: matchQuery
        },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalEarnings: { $sum: "$restaurantEarnings" }
            }
        }
    ]);

    const totalOrders = stats.length > 0 ? stats[0].totalOrders : 0;
    const totalEarnings = stats.length > 0 ? stats[0].totalEarnings : 0;

    return res.json({
        success: true,
        totalOrders,
        totalEarnings
    });
};
