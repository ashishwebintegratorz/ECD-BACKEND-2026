import { Request, Response } from "express";
import Restaurant from "../models/Restaurant.model.js";
import { NotFoundException, BadRequestException } from "../utils/appError.js";
import { slugify } from "../validators/restaurant.validator.js";
import { Types } from "mongoose";

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
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const toObjectId = (id: string) => new Types.ObjectId(id as string);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/restaurants/list
// Query: ?page=1&limit=10&search=&lat=&lng=
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurants = async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10)); // cap at 50
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
// PUBLIC: GET /api/restaurants/details/:slug
// ─────────────────────────────────────────────────────────────────────────────
export const getRestaurantBySlug = async (req: Request, res: Response) => {
    const restaurant = await Restaurant.findOne({
        slug: req.params.slug,
        isActive: true,
    }).lean();

    if (!restaurant) throw new NotFoundException("Restaurant not found");

    // Group available menu items by foodType
    const groupedMenu: Record<string, typeof restaurant.menu> = {};
    for (const item of restaurant.menu) {
        if (!item.isAvailable) continue;
        if (!groupedMenu[item.foodType]) groupedMenu[item.foodType] = [];
        groupedMenu[item.foodType].push(item);
    }

    return res.json({
        restaurant: {
            _id: restaurant._id,
            name: restaurant.name,
            slug: restaurant.slug,
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
    const { slug } = req.params;
    const foodType = req.query.foodType as string | undefined;

    const restaurant = await Restaurant.findOne(
        { slug, isActive: true },
        { menu: 1 } // projection — only fetch menu field
    ).lean();

    if (!restaurant) throw new NotFoundException("Restaurant not found");

    let menu = restaurant.menu.filter((item) => item.isAvailable);
    if (foodType) menu = menu.filter((item) => item.foodType === foodType);

    return res.json({ menu });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /api/restaurants/admin/create
// ─────────────────────────────────────────────────────────────────────────────
export const createRestaurant = async (req: Request, res: Response) => {
    const { name, description, address, phone, email, logo, coverImage, lat, lng } = req.body;

    // Auto-generate slug if not provided, ensure uniqueness
    let slug: string = req.body.slug ? req.body.slug : slugify(name);
    const existing = await Restaurant.findOne({ slug });
    if (existing) {
        // append short unique suffix to avoid collision
        slug = `${slug}-${Date.now().toString(36)}`;
    }

    const restaurant = await Restaurant.create({
        name,
        slug,
        storeType: req.body.storeType ?? "restaurant",
        description,
        address,
        location: { type: "Point", coordinates: [Number(lng), Number(lat)] },
        phone,
        email,
        logo,
        coverImage,
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
        logo, coverImage, isActive, featured, lat, lng } = req.body;

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
            ...(isActive !== undefined && { isActive }),
            ...(featured !== undefined && { featured }),
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
    const { name, description, price, image, foodType, isAvailable } = req.body;

    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    restaurant.menu.push({
        name,
        description,
        price: Number(price),
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
        (m) => (m as any)._id.equals(toObjectId(itemId))
    );
    if (!item) throw new NotFoundException("Menu item not found");

    if (req.body.name !== undefined) item.name = req.body.name;
    if (req.body.description !== undefined) item.description = req.body.description;
    if (req.body.price !== undefined) item.price = Number(req.body.price);
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
        (m) => !(m as any)._id.equals(toObjectId(itemId))
    ) as any;

    if (restaurant.menu.length === before)
        throw new NotFoundException("Menu item not found");

    await restaurant.save();

    return res.json({ message: "Menu item deleted" });
};
