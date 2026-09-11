import { Request, Response } from "express";
import Restaurant from "../models/Restaurant.model.js";
import Product from "../models/Product.model.js";
import Category from "../models/Category.model.js";
import Order from "../models/Order.model.js";
import { NotFoundException, BadRequestException } from "../utils/appError.js";
import { slugify } from "../validators/restaurant.validator.js";
import { Types } from "mongoose";
import { createAndSendOtp, verifyOtp } from "../services/otp.service.js";
import Notification from "../models/Notification.model.js";
import { emitRestaurantStatusUpdate, emitAccountSuspended } from "../socket/orderSocket.js";
import { createAndEmitAdminNotification } from "../services/adminNotification.service.js";
import UserModel from "../models/User.model.js";
import { signAccessJwt } from "../utils/jwt.js";
import { imagekit } from "../config/imagekit.js";
import { uploadToImageKit } from "../services/imagekit.service.js";
import DeliveryZone from "../models/DeliveryZone.model.js";
import City from "../models/City.model.js";
import { isPointInPolygon, calculateDistanceKm } from "../services/locationValidation.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Auto-resolve cityId and zoneIds for a restaurant given coords / inputs
export const resolveRestaurantGeo = async (
    lng?: number,
    lat?: number,
    cityId?: string,
    zoneIds?: string[] | string
): Promise<{ resolvedCityId?: Types.ObjectId; resolvedZoneIds: Types.ObjectId[] }> => {
    let resolvedZoneIds: Types.ObjectId[] = [];
    let resolvedCityId: Types.ObjectId | undefined = undefined;

    const rawZones = Array.isArray(zoneIds) ? zoneIds : (zoneIds ? [zoneIds] : []);
    if (rawZones.length > 0) {
        resolvedZoneIds = rawZones
            .filter((id) => id && Types.ObjectId.isValid(String(id)))
            .map((id) => toObjectId(String(id)));
    }

    if (cityId && Types.ObjectId.isValid(String(cityId))) {
        resolvedCityId = toObjectId(String(cityId));
    }

    if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng)) && Number(lat) !== 0 && Number(lng) !== 0) {
        const numLat = Number(lat);
        const numLng = Number(lng);

        const activeZones = await DeliveryZone.find({ isActive: true }).lean();
        const matchedZoneIds: Types.ObjectId[] = [];
        let matchedCityIdFromZone: Types.ObjectId | undefined = undefined;

        for (const zone of activeZones) {
            let isInside = false;
            if (
                zone.polygonCoordinates &&
                Array.isArray(zone.polygonCoordinates) &&
                zone.polygonCoordinates.length >= 3
            ) {
                isInside = isPointInPolygon([numLng, numLat], zone.polygonCoordinates);
            }
            if (!isInside) {
                const center = zone.center || { lat: 28.4595, lng: 77.0266 };
                const radius = zone.radiusKm || 15;
                const dist = calculateDistanceKm(numLat, numLng, center.lat, center.lng);
                if (dist <= radius) {
                    isInside = true;
                }
            }

            if (isInside) {
                matchedZoneIds.push(zone._id as Types.ObjectId);
                if (!matchedCityIdFromZone && zone.cityId) {
                    matchedCityIdFromZone = zone.cityId as Types.ObjectId;
                }
            }
        }

        if (matchedZoneIds.length > 0) {
            if (resolvedZoneIds.length === 0) {
                resolvedZoneIds = matchedZoneIds;
            }
            if (!resolvedCityId && matchedCityIdFromZone) {
                resolvedCityId = matchedCityIdFromZone;
            }
        }
    }

    // Fallback: If cityId is set but no zones yet, match all active zones for that city
    if (resolvedCityId && resolvedZoneIds.length === 0) {
        const cityZones = await DeliveryZone.find({ cityId: resolvedCityId, isActive: true }).lean();
        resolvedZoneIds = cityZones.map(z => z._id as Types.ObjectId);
    }

    return { resolvedCityId, resolvedZoneIds };
};

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
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return dist;
};

const toObjectId = (id: string) => new Types.ObjectId(id as string);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/restaurants/list
// Query: ?page=1&limit=10&search=&lat=&lng=&cityId=&zoneId=
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurants = async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 50)); // cap at 1000
    const search = (req.query.search as string) || "";
    const storeType = (req.query.storeType as string) || "";
    const userLat = req.query.lat ? Number(req.query.lat) : null;
    const userLng = req.query.lng ? Number(req.query.lng) : null;
    const hasCoords = userLat !== null && userLng !== null;

    const cityId = (req.query.cityId as string) || "";
    const zoneId = (req.query.zoneId as string) || "";

    const dietary = req.query.dietary ? String(req.query.dietary) : undefined; // "Veg" or "Non-Veg"

    const parseNum = (val: any) => val && !isNaN(Number(val)) ? Number(val) : null;
    const minPrice = parseNum(req.query.minPrice);
    const maxPrice = parseNum(req.query.maxPrice);
    const minRating = parseNum(req.query.minRating);
    const maxDistance = parseNum(req.query.maxDistance);

    const status = req.query.status ? String(req.query.status) : undefined; // "Open Now" or "Closed"

    const andConditions: any[] = [{ isActive: true }];

    if (storeType) andConditions.push({ storeType });

    // City & Zone Filtering:
    if (cityId && Types.ObjectId.isValid(cityId) && zoneId && Types.ObjectId.isValid(zoneId)) {
        andConditions.push({
            $or: [
                { cityId: toObjectId(cityId) },
                { zoneIds: { $in: [toObjectId(zoneId)] } },
            ],
        });
    } else if (zoneId && Types.ObjectId.isValid(zoneId)) {
        andConditions.push({
            $or: [
                { zoneIds: { $in: [toObjectId(zoneId)] } },
                { zoneIds: { $size: 0 } },
                { zoneIds: { $exists: false } },
            ],
        });
    } else if (cityId && Types.ObjectId.isValid(cityId)) {
        andConditions.push({ cityId: toObjectId(cityId) });
    }

    if (search) {
        andConditions.push({
            $or: [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ],
        });
    }

    if (dietary === "Veg") {
        andConditions.push({ "menu.foodType": { $in: ["veg", "vegan"] } });
    } else if (dietary === "Non-Veg") {
        andConditions.push({ "menu.foodType": "non-veg" });
    }

    if (minPrice !== null || maxPrice !== null) {
        const priceCond: any = {};
        if (minPrice !== null) priceCond.$gte = minPrice;
        if (maxPrice !== null) priceCond.$lte = maxPrice;
        andConditions.push({ "menu.price": priceCond });
    }

    if (minRating !== null) {
        andConditions.push({ adminRating: { $gte: minRating } });
    }

    if (status === "Open Now") {
        andConditions.push({ isOnline: true });
    } else if (status === "Closed") {
        andConditions.push({ isOnline: false });
    }

    const filter: any = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    console.log("Filtering Restaurants with:", JSON.stringify(filter));
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
            debugFilter: filter
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
        .filter((r) => maxDistance === null || r.distanceKm <= maxDistance)
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
    const cityId = (req.query.cityId as string) || "";
    const zoneId = (req.query.zoneId as string) || "";
    const storeType = (req.query.storeType as string) || "";

    if (!query) {
        return res.json({ success: true, restaurants: [] });
    }

    const regex = new RegExp(query, "i");

    const andConditions: any[] = [
        { isActive: true },
        {
            $or: [
                { name: { $regex: regex } },
                { categories: { $regex: regex } },
                { "menu.name": { $regex: regex } },
                { description: { $regex: regex } },
            ],
        },
    ];

    if (storeType) andConditions.push({ storeType });
    if (cityId && Types.ObjectId.isValid(cityId) && zoneId && Types.ObjectId.isValid(zoneId)) {
        andConditions.push({
            $or: [
                { cityId: toObjectId(cityId) },
                { zoneIds: { $in: [toObjectId(zoneId)] } },
            ],
        });
    } else if (zoneId && Types.ObjectId.isValid(zoneId)) {
        andConditions.push({
            $or: [
                { zoneIds: { $in: [toObjectId(zoneId)] } },
                { zoneIds: { $size: 0 } },
                { zoneIds: { $exists: false } },
            ],
        });
    } else if (cityId && Types.ObjectId.isValid(cityId)) {
        andConditions.push({ cityId: toObjectId(cityId) });
    }

    const filter: any = { $and: andConditions };

    // Search in Restaurant: Name, Categories (string array), Menu Items
    const restaurants = await Restaurant.find(filter)
        .select("name slug description address location logo coverImage categories adminRating avgRating totalReviews featured orderCount storeType isActive isOnline menu")
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
    const cityId = (req.query.cityId as string) || "";
    const zoneId = (req.query.zoneId as string) || "";
    const storeType = (req.query.storeType as string) || "";

    // 1. Find the category to get its name
    const category = await Category.findOne({ slug });

    // 2. Search restaurants that have this category name or matching items
    const categoryName = category ? category.name : "";
    const query = categoryName || slug;
    const regex = new RegExp(query, "i");

    const andConditions: any[] = [
        { isActive: true },
        {
            $or: [
                { categories: { $regex: regex } },
                { "menu.name": { $regex: regex } }
            ]
        }
    ];

    if (storeType) andConditions.push({ storeType });
    if (cityId && Types.ObjectId.isValid(cityId) && zoneId && Types.ObjectId.isValid(zoneId)) {
        andConditions.push({
            $or: [
                { cityId: toObjectId(cityId) },
                { zoneIds: { $in: [toObjectId(zoneId)] } },
            ],
        });
    } else if (zoneId && Types.ObjectId.isValid(zoneId)) {
        andConditions.push({
            $or: [
                { zoneIds: { $in: [toObjectId(zoneId)] } },
                { zoneIds: { $size: 0 } },
                { zoneIds: { $exists: false } },
            ],
        });
    } else if (cityId && Types.ObjectId.isValid(cityId)) {
        andConditions.push({ cityId: toObjectId(cityId) });
    }

    const filter: any = { $and: andConditions };

    const restaurants = await Restaurant.find(filter)
        .select("name slug description address location logo coverImage categories adminRating avgRating totalReviews featured orderCount storeType isActive isOnline menu")
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
    const cityId = (req.query.cityId as string) || "";
    const zoneId = (req.query.zoneId as string) || "";

    if (!query || query.length < 2) {
        return res.json({ suggestions: [] });
    }

    const regex = new RegExp(query, "i");

    const andConditions: any[] = [{ isActive: true }];
    if (cityId && Types.ObjectId.isValid(cityId) && zoneId && Types.ObjectId.isValid(zoneId)) {
        andConditions.push({
            $or: [
                { cityId: toObjectId(cityId) },
                { zoneIds: { $in: [toObjectId(zoneId)] } },
            ],
        });
    } else if (zoneId && Types.ObjectId.isValid(zoneId)) {
        andConditions.push({
            $or: [
                { zoneIds: { $in: [toObjectId(zoneId)] } },
                { zoneIds: { $size: 0 } },
                { zoneIds: { $exists: false } },
            ],
        });
    } else if (cityId && Types.ObjectId.isValid(cityId)) {
        andConditions.push({ cityId: toObjectId(cityId) });
    }

    const restFilter: any = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    // 1. Find matching restaurant names
    const restaurantMatches = await Restaurant.find({
        ...restFilter,
        name: regex,
    })
        .select("name logo slug")
        .limit(5)
        .lean();

    // 2. Find matching items (from Restaurant menu AND Product collection)
    const [menuItemMatches, productMatches] = await Promise.all([
        Restaurant.aggregate([
            { $match: restFilter },
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
        ...restFilter,
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
        if (item.portions && Array.isArray(item.portions)) {
            item.portions.forEach((p: any) => delete p.b2bPrice);
        }

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
            avgRating: restaurant.avgRating,
            totalReviews: restaurant.totalReviews,
            featured: restaurant.featured,
            orderCount: restaurant.orderCount,
            isActive: restaurant.isActive,
            isOnline: restaurant.isOnline,
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
    menu.forEach(item => {
        delete (item as any).b2bPrice;
        if (item.portions && Array.isArray(item.portions)) {
            item.portions.forEach((p: any) => delete p.b2bPrice);
        }
    });

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

    const { name, description, address, phone, email, logo, coverImage, accountDetail, lat, lng, categories, upi, cityId, zoneIds } = req.body;

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

    const { resolvedCityId, resolvedZoneIds } = await resolveRestaurantGeo(
        lng !== undefined ? Number(lng) : undefined,
        lat !== undefined ? Number(lat) : undefined,
        cityId,
        zoneIds
    );

    const restaurant = await Restaurant.create({
        name,
        slug,
        restaurantId,
        restaurantKey,
        storeType: req.body.storeType ?? "restaurant",
        cityId: resolvedCityId,
        zoneIds: resolvedZoneIds,
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
        logo, coverImage, accountDetail, isActive, featured, lat, lng, categories, storeType, paymentQr, upi, cityId, zoneIds } = req.body;

    if (slug && slug !== restaurant.slug) {
        const taken = await Restaurant.findOne({ slug });
        if (taken) throw new BadRequestException("Slug already in use");
    }

    const location =
        lat !== undefined && lng !== undefined
            ? { type: "Point" as const, coordinates: [Number(lng), Number(lat)] as [number, number] }
            : restaurant.location;

    const targetLng = lng !== undefined ? Number(lng) : restaurant.location?.coordinates?.[0];
    const targetLat = lat !== undefined ? Number(lat) : restaurant.location?.coordinates?.[1];

    const { resolvedCityId, resolvedZoneIds } = await resolveRestaurantGeo(
        targetLng,
        targetLat,
        cityId || (restaurant.cityId?.toString()),
        zoneIds || (restaurant.zoneIds?.map((z: any) => z.toString()))
    );

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
            cityId: resolvedCityId,
            zoneIds: resolvedZoneIds,
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

// Helper to upload base64 image strings to ImageKit CDN so database never stores raw base64
const normalizeAndUploadImage = async (image: string | undefined, name: string): Promise<string> => {
    if (!image || typeof image !== 'string') return image || '';
    const trimmed = image.trim();
    if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:application/')) {
        try {
            const base64Data = trimmed.includes(',') ? trimmed.split(',')[1] : trimmed;
            const uploadRes = await imagekit.upload({
                file: base64Data,
                fileName: `menu_${Date.now()}_${slugify(name || 'item')}.jpg`,
                folder: '/ecd-menu',
            });
            if (uploadRes && uploadRes.url) {
                return uploadRes.url;
            }
        } catch (err) {
            console.error("Failed to auto-upload base64 menu image to ImageKit:", err);
        }
    }
    return trimmed;
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /api/restaurants/admin/menu/add/:id
// ─────────────────────────────────────────────────────────────────────────────
export const addMenuItem = async (req: Request, res: Response) => {
    const { name, description, price, b2bPrice, image, foodType, isAvailable, portion, portions, category } = req.body;

    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const finalImage = await normalizeAndUploadImage(image, name);

    let finalPortions = portions;
    if (!finalPortions || !Array.isArray(finalPortions) || finalPortions.length === 0) {
        finalPortions = [
            {
                name: portion || 'Full',
                price: Number(price) || 0,
                b2bPrice: b2bPrice !== undefined ? Number(b2bPrice) : 0,
                isDefault: true,
            }
        ];
    } else {
        finalPortions = finalPortions.map((p: any) => ({
            name: p.name || 'Full',
            price: Number(p.price) || 0,
            b2bPrice: Number(p.b2bPrice) || 0,
            isDefault: !!p.isDefault
        }));
    }

    const defaultPortion = finalPortions.find((p: any) => p.isDefault) || finalPortions[0];
    const finalCategory = (category && typeof category === 'string' && category.trim().length > 0) ? category.trim() : "Main Course";
    const normalizedFoodType = (foodType && typeof foodType === 'string')
        ? (foodType.toLowerCase() === 'veg' || foodType.toLowerCase() === 'vegetarian' ? 'veg' : (foodType.toLowerCase() === 'vegan' ? 'vegan' : 'non-veg'))
        : 'veg';

    restaurant.menu.push({
        name,
        description,
        category: finalCategory,
        price: defaultPortion.price !== undefined ? Number(defaultPortion.price) : (Number(price) || 0),
        b2bPrice: defaultPortion.b2bPrice !== undefined ? Number(defaultPortion.b2bPrice) : (b2bPrice !== undefined ? Number(b2bPrice) : 0),
        portion: portion || defaultPortion.name || 'Full',
        portions: finalPortions,
        image: finalImage,
        foodType: normalizedFoodType,
        isAvailable: isAvailable ?? true,
    });

    if (!restaurant.categories) restaurant.categories = [];
    if (finalCategory && !restaurant.categories.includes(finalCategory)) {
        restaurant.categories.push(finalCategory);
    }

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
    if (req.body.category !== undefined) {
        const cat = (typeof req.body.category === 'string' && req.body.category.trim().length > 0) ? req.body.category.trim() : "Main Course";
        item.category = cat;
        if (!restaurant.categories) restaurant.categories = [];
        if (cat && !restaurant.categories.includes(cat)) {
            restaurant.categories.push(cat);
        }
    }
    if (req.body.price !== undefined) item.price = Number(req.body.price);
    if (req.body.b2bPrice !== undefined) (item as any).b2bPrice = Number(req.body.b2bPrice);
    if (req.body.image !== undefined) {
        item.image = await normalizeAndUploadImage(req.body.image, item.name);
    }
    if (req.body.foodType !== undefined) item.foodType = req.body.foodType;
    if (req.body.portion !== undefined) (item as any).portion = req.body.portion;
    if (req.body.portions !== undefined && Array.isArray(req.body.portions)) {
        (item as any).portions = req.body.portions;
        const defaultPortion = req.body.portions.find((p: any) => p.isDefault) || req.body.portions[0];
        if (defaultPortion) {
            if (req.body.portion === undefined) (item as any).portion = defaultPortion.name;
            if (req.body.price === undefined && defaultPortion.price !== undefined) item.price = Number(defaultPortion.price);
            if (req.body.b2bPrice === undefined && defaultPortion.b2bPrice !== undefined) (item as any).b2bPrice = Number(defaultPortion.b2bPrice);
        }
    }
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
    const { isOnline, isActive } = req.body || {};

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
    }

    if (isActive !== undefined) {
        restaurant.isActive = isActive;
        if (isActive === false) {
            emitAccountSuspended(restaurant._id.toString(), "restaurant");
        }
    }
    if (isOnline !== undefined) restaurant.isOnline = isOnline;
    if (isActive === undefined && isOnline === undefined) restaurant.isOnline = !restaurant.isOnline;

    await restaurant.save();
    emitRestaurantStatusUpdate(restaurant._id.toString(), restaurant.isOnline, restaurant.isActive, restaurant);

    return res.json({
        success: true,
        message: `Restaurant is now ${restaurant.isOnline ? "online" : "offline"}`,
        isOnline: restaurant.isOnline,
        isActive: restaurant.isActive,
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

    const token = signAccessJwt({
        sub: restaurant._id.toString(),
        role: "restaurant"
    });

    // Self-healing: if an existing restaurant lacks a restaurantId, generate and save it
    if (!restaurant.restaurantId) {
        let restaurantId = '';
        for (let i = 0; i < 14; i++) restaurantId += Math.floor(Math.random() * 10).toString();
        restaurant.restaurantId = restaurantId;
        await restaurant.save();
    }

    // Sign a proper JWT here instead of test token bypass
    return res.json({
        token,
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

    let restaurant = null;
    if (typeof restaurantId === 'string' && restaurantId.match(/^[0-9a-fA-F]{24}$/)) {
        restaurant = await Restaurant.findById(restaurantId);
    }
    if (!restaurant) {
        restaurant = await Restaurant.findOne({ restaurantId: restaurantId });
    }
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
            menu: (restaurant.menu || []).filter((m: any) => m.approvalStatus !== "deleted"),
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

    let restaurant = null;
    if (typeof restaurantId === 'string' && restaurantId.match(/^[0-9a-fA-F]{24}$/)) {
        restaurant = await Restaurant.findById(restaurantId);
    }
    if (!restaurant) {
        restaurant = await Restaurant.findOne({ restaurantId: restaurantId });
    }
    if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
    }

    const orders = await Order.find({
        store: restaurant._id,
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

    const token = signAccessJwt({
        sub: restaurant._id.toString(),
        role: "restaurant"
    });

    return res.json({
        token,
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

    let restaurant = null;
    if (typeof restaurantId === 'string' && restaurantId.match(/^[0-9a-fA-F]{24}$/)) {
        restaurant = await Restaurant.findById(restaurantId);
    }
    if (!restaurant) {
        restaurant = await Restaurant.findOne({ restaurantId: restaurantId });
    }
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


// ============================================================================
// MENU MANAGEMENT BY VENDOR & ADMIN APPROVAL
// ============================================================================

export const vendorAddMenuItem = async (req: Request, res: Response) => {
    try {
        const restaurantId = req.params.restaurantId as string;
        const { name, description, image, foodType } = req.body;

        const restaurant = await Restaurant.findOne({
            $or: [
                { restaurantId: restaurantId },
                ...(Types.ObjectId.isValid(restaurantId) ? [{ _id: restaurantId }] : [])
            ]
        });
        if (!restaurant) {
            return res.status(404).json({ success: false, message: "Restaurant not found" });
        }

        // Support b2bPrice, b2b_price, or price sent from restaurant app
        const rawB2B = req.body.b2bPrice !== undefined ? req.body.b2bPrice : (req.body.price !== undefined ? req.body.price : req.body.b2b_price);
        const parsedB2B = Number(rawB2B) || 0;

        const finalImage = await normalizeAndUploadImage(image, name);

        let finalPortions = req.body.portions;
        if (!finalPortions || !Array.isArray(finalPortions) || finalPortions.length === 0) {
            finalPortions = [
                {
                    name: req.body.portion || "Full",
                    price: 0,
                    b2bPrice: parsedB2B,
                    isDefault: true
                }
            ];
        } else {
            finalPortions = finalPortions.map((p: any) => ({
                name: p.name || "Full",
                price: Number(p.price) || 0,
                b2bPrice: Number(p.b2bPrice) || 0,
                isDefault: !!p.isDefault
            }));
        }

        const defaultPortion = finalPortions.find((p: any) => p.isDefault) || finalPortions[0];
        const finalCategory = (req.body.category && typeof req.body.category === 'string' && req.body.category.trim().length > 0) ? req.body.category.trim() : "Main Course";
        const normalizedFoodType = (foodType && typeof foodType === 'string')
            ? (foodType.toLowerCase() === 'veg' || foodType.toLowerCase() === 'vegetarian' ? 'veg' : (foodType.toLowerCase() === 'vegan' ? 'vegan' : 'non-veg'))
            : 'veg';

        const newItem = {
            name,
            description,
            category: finalCategory,
            price: defaultPortion.price !== undefined ? Number(defaultPortion.price) : 0,
            b2bPrice: defaultPortion.b2bPrice !== undefined ? Number(defaultPortion.b2bPrice) : parsedB2B,
            portion: req.body.portion || defaultPortion.name || "Full",
            portions: finalPortions,
            image: finalImage,
            foodType: normalizedFoodType as any,
            isAvailable: false, // Default not available until approved
            approvalStatus: "pending" as any
        };

        restaurant.menu.push(newItem as any);
        if (!restaurant.categories) restaurant.categories = [];
        if (finalCategory && !restaurant.categories.includes(finalCategory)) {
            restaurant.categories.push(finalCategory);
        }
        await restaurant.save();

        // Broadcast real-time notification to admin panel
        await createAndEmitAdminNotification({
            title: "New Menu Item Pending Approval",
            body: `Restaurant ${restaurant.name} added "${name}". Please review and set the selling price.`,
            category: "menu_approval",
            data: {
                restaurantId: restaurant._id.toString(),
                itemName: name,
                b2bPrice: parsedB2B,
                linkUrl: "/restaurants/approvals",
            }
        });

        return res.status(201).json({
            success: true,
            message: "Menu item submitted for approval",
            menu: restaurant.menu
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const vendorToggleMenuItem = async (req: Request, res: Response) => {
    try {
        const restaurantId = req.params.restaurantId as string;
        const itemId = req.params.itemId as string;
        const { isAvailable } = req.body;

        const restaurant = await Restaurant.findOne({
            $or: [
                { restaurantId: restaurantId },
                ...(Types.ObjectId.isValid(restaurantId) ? [{ _id: restaurantId }] : [])
            ]
        });
        if (!restaurant) {
            return res.status(404).json({ success: false, message: "Restaurant not found" });
        }

        const menuItem = restaurant.menu.find(m => (m as any)._id.toString() === itemId);
        if (!menuItem) {
            return res.status(404).json({ success: false, message: "Menu item not found" });
        }

        menuItem.isAvailable = isAvailable;
        await restaurant.save();

        return res.json({
            success: true,
            message: "Menu item availability updated",
            menu: restaurant.menu
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const adminApproveMenuItem = async (req: Request, res: Response) => {
    try {
        const restaurantId = req.params.restaurantId as string;
        const itemId = req.params.itemId as string;
        const { approvalStatus, price } = req.body;

        const restaurant = await Restaurant.findOne({
            $or: [
                { restaurantId: restaurantId },
                ...(Types.ObjectId.isValid(restaurantId) ? [{ _id: restaurantId }] : [])
            ]
        });
        if (!restaurant) {
            return res.status(404).json({ success: false, message: "Restaurant not found" });
        }

        const menuItemIndex = restaurant.menu.findIndex(m => (m as any)._id.toString() === itemId);
        if (menuItemIndex === -1) {
            return res.status(404).json({ success: false, message: "Menu item not found" });
        }

        const menuItem = restaurant.menu[menuItemIndex] as any;

        if (approvalStatus === "deleted") {
            // Delete menu item completely from the restaurant's menu
            restaurant.menu.splice(menuItemIndex, 1);
            await restaurant.save();

            return res.json({
                success: true,
                message: "Menu item deleted successfully",
                menu: restaurant.menu
            });
        }

        if (approvalStatus) {
            menuItem.approvalStatus = approvalStatus;
            if (approvalStatus === "approved") {
                menuItem.isAvailable = true;
                menuItem.deleteReason = undefined;

                // Ensure image is uploaded to ImageKit if it was stored as base64
                if (menuItem.image && typeof menuItem.image === 'string' && (menuItem.image.startsWith('data:image/') || menuItem.image.startsWith('data:application/'))) {
                    menuItem.image = await normalizeAndUploadImage(menuItem.image, menuItem.name);
                }
            } else if (approvalStatus === "rejected") {
                menuItem.isAvailable = false;
            }
        }
        if (price !== undefined && price !== null) {
            menuItem.price = Number(price);
        }
        if (req.body.portions !== undefined && Array.isArray(req.body.portions)) {
            menuItem.portions = req.body.portions;
            const def = req.body.portions.find((p: any) => p.isDefault) || req.body.portions[0];
            if (def && def.price !== undefined) {
                menuItem.price = Number(def.price);
            }
        }

        await restaurant.save();

        return res.json({
            success: true,
            message: "Menu item updated successfully",
            menu: restaurant.menu
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};


export const getPendingMenuItems = async (req: Request, res: Response) => {
    try {
        const restaurants = await Restaurant.find({ "menu.approvalStatus": { $in: ["pending", "delete_pending"] } });
        const pendingItems: any[] = [];

        restaurants.forEach(rest => {
            rest.menu.forEach(item => {
                if (["pending", "delete_pending"].includes((item as any).approvalStatus)) {
                    pendingItems.push({
                        restaurantId: rest._id,
                        restaurantName: rest.name,
                        _id: (item as any)._id,
                        name: item.name,
                        description: item.description,
                        b2bPrice: item.b2bPrice,
                        portion: item.portion || "Full",
                        portions: item.portions && item.portions.length > 0 ? item.portions : [{ name: item.portion || "Full", price: item.price || 0, b2bPrice: item.b2bPrice || 0, isDefault: true }],
                        image: item.image,
                        foodType: item.foodType,
                        approvalStatus: (item as any).approvalStatus,
                        deleteReason: (item as any).deleteReason
                    });
                }
            });
        });

        return res.json({ success: true, pendingItems });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const vendorRequestDeleteMenuItem = async (req: Request, res: Response) => {
    try {
        const restaurantId = req.params.restaurantId as string;
        const itemId = req.params.itemId as string;
        const { reason } = req.body;

        const restaurant = await Restaurant.findOne({
            $or: [
                { restaurantId: restaurantId },
                ...(Types.ObjectId.isValid(restaurantId) ? [{ _id: restaurantId }] : [])
            ]
        });
        if (!restaurant) {
            return res.status(404).json({ success: false, message: "Restaurant not found" });
        }

        const menuItem = restaurant.menu.find(m => (m as any)._id.toString() === itemId) as any;
        if (!menuItem) {
            return res.status(404).json({ success: false, message: "Menu item not found" });
        }

        menuItem.approvalStatus = "delete_pending";
        menuItem.isAvailable = false;
        menuItem.deleteReason = reason || "No reason provided";

        await restaurant.save();

        // Broadcast real-time notification to admin panel
        await createAndEmitAdminNotification({
            title: "Menu Item Deletion Request",
            body: `Restaurant ${restaurant.name} requested deletion of "${menuItem.name}": "${reason || "No reason provided"}"`,
            category: "menu_approval",
            data: {
                restaurantId: restaurant._id.toString(),
                itemId: menuItem._id.toString(),
                itemName: menuItem.name,
                reason,
                linkUrl: "/restaurants/approvals",
            }
        });

        return res.json({
            success: true,
            message: "Deletion request submitted",
            menu: restaurant.menu
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getPastMenuApprovals = async (req: Request, res: Response) => {
    try {
        const restaurants = await Restaurant.find({
            "menu.approvalStatus": { $in: ["approved", "rejected"] }
        });
        const pastItems: any[] = [];

        restaurants.forEach(rest => {
            rest.menu.forEach(item => {
                if (["approved", "rejected"].includes((item as any).approvalStatus)) {
                    pastItems.push({
                        restaurantId: rest._id,
                        restaurantName: rest.name,
                        _id: (item as any)._id,
                        name: item.name,
                        description: item.description,
                        b2bPrice: item.b2bPrice,
                        price: item.price,
                        portion: item.portion || "Full",
                        portions: item.portions && item.portions.length > 0 ? item.portions : [{ name: item.portion || "Full", price: item.price || 0, b2bPrice: item.b2bPrice || 0, isDefault: true }],
                        image: item.image,
                        foodType: item.foodType,
                        approvalStatus: (item as any).approvalStatus,
                        deleteReason: (item as any).deleteReason
                    });
                }
            });
        });

        return res.json({ success: true, pastItems });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Vendor: Delete account permanently
 */
export const vendorDeleteAccount = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user || (!user._id && !user.id)) {
            return res.status(400).json({ success: false, message: "Restaurant ID missing" });
        }

        const restaurantId = user._id || user.id;

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
            return res.status(404).json({ success: false, message: "Restaurant not found" });
        }

        if (restaurant.walletBalance && restaurant.walletBalance > 0) {
            return res.status(400).json({
                success: false,
                message: `First you have to clear your pending payout (₹${restaurant.walletBalance}) with the admin. Once the admin clears your payment, you can permanently delete your account.`
            });
        }

        // We assume the user _id matches the Restaurant _id or the restaurant auth mapping.
        await Restaurant.findByIdAndDelete(restaurantId);
        await UserModel.findByIdAndDelete(restaurantId);

        return res.json({ success: true, message: "Account deleted successfully" });
    } catch (error: any) {
        console.error("Delete restaurant account error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT CATEGORIES: GET /api/restaurants/:id/categories
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantCategories = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const query: any = Types.ObjectId.isValid(id) ? { _id: id } : { slug: id };
    const restaurant = await Restaurant.findOne(query).select("categories menu");
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const menuCategories = restaurant.menu
        .map((m) => m.category)
        .filter((c): c is string => Boolean(c && c.trim()));
    const allCategories = Array.from(
        new Set([...(restaurant.categories || []), ...menuCategories])
    ).filter(Boolean);

    return res.json({ success: true, categories: allCategories });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT CATEGORIES: POST /api/restaurants/:id/categories
// ─────────────────────────────────────────────────────────────────────────────
export const addRestaurantCategory = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { category } = req.body;
    if (!category || typeof category !== "string" || !category.trim()) {
        throw new BadRequestException("Category name is required");
    }

    const trimmedCat = category.trim();
    const query: any = Types.ObjectId.isValid(id) ? { _id: id } : { slug: id };
    const restaurant = await Restaurant.findOne(query);
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    if (!restaurant.categories) restaurant.categories = [];
    if (!restaurant.categories.includes(trimmedCat)) {
        restaurant.categories.push(trimmedCat);
        await restaurant.save();
    }

    return res.status(201).json({ success: true, message: "Category added", categories: restaurant.categories });
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT CATEGORIES: DELETE /api/restaurants/:id/categories/:categoryName
// ─────────────────────────────────────────────────────────────────────────────
export const deleteRestaurantCategory = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const categoryName = String(req.params.categoryName);
    const query: any = Types.ObjectId.isValid(id) ? { _id: id } : { slug: id };
    const restaurant = await Restaurant.findOne(query);
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    if (restaurant.categories) {
        restaurant.categories = restaurant.categories.filter(
            (c) => c.toLowerCase() !== decodeURIComponent(categoryName).toLowerCase()
        );
        await restaurant.save();
    }

    return res.json({ success: true, message: "Category removed", categories: restaurant.categories });
};

