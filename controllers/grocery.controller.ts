import { Request, Response } from "express";
import Restaurant from "../models/Restaurant.model.js";
import Product from "../models/Product.model.js";
import Category from "../models/Category.model.js";
import { uploadToImageKit } from "../services/imagekit.service.js";
import { NotFoundException, BadRequestException, InternalServerException } from "../utils/appError.js";
import { slugify } from "../validators/restaurant.validator.js";

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const rankScore = (adminRating: number, orderCount: number, featured: boolean, distanceKm: number) =>
    (featured ? 10 : 0) + adminRating * 2 + Math.log(orderCount + 1) - distanceKm * 0.1;

const haversineKm = ([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number => {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const uploadProductImage = async (file: Express.Multer.File): Promise<string> =>
    uploadToImageKit(file.buffer, file.originalname || "product.jpg", "/grocery-products");

const parseVariants = async (req: Request) => {
    let variants: any[] = [];
    try {
        variants = JSON.parse(req.body.variants || "[]");
    } catch {
        throw new BadRequestException("Invalid variants format. Must be JSON.");
    }
    if (!Array.isArray(variants) || variants.length === 0)
        throw new BadRequestException("At least one variant is required");

    const files = req.files as Express.Multer.File[];
    for (let i = 0; i < variants.length; i++) {
        const variantFiles = files?.filter((f) => f.fieldname === `variantImages_${i}`) ?? [];
        const uploadedUrls: string[] = [];
        for (const file of variantFiles) uploadedUrls.push(await uploadProductImage(file));


        const oldImages = variants[i].images?.filter((url: string) => url.startsWith("http")) || [];
        variants[i].images = [...oldImages, ...uploadedUrls];
        variants[i].price = Number(variants[i].price);
        variants[i].mrp = variants[i].mrp ? Number(variants[i].mrp) : undefined;
        variants[i].stock = variants[i].stock !== undefined ? Number(variants[i].stock) : 0;
        if (variants[i].expiryDate) variants[i].expiryDate = new Date(variants[i].expiryDate);
    }
    return variants;
};

// ═════════════════════════════════════════════════════════════════════════════
// STORE — PUBLIC
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/v1/grocery/list?page=&limit=&search=&lat=&lng=
export const getGroceryStores = async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 10);
    const search = (req.query.search as string) || "";
    const userLat = req.query.lat ? Number(req.query.lat) : null;
    const userLng = req.query.lng ? Number(req.query.lng) : null;
    const hasCoords = userLat !== null && userLng !== null;

    const filter: any = { isActive: true, storeType: "grocery" };
    if (search) filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
    ];

    if (!hasCoords) {
        const [stores, total] = await Promise.all([
            Restaurant.find(filter).select("-menu")
                .sort({ featured: -1, adminRating: -1, orderCount: -1 })
                .skip((page - 1) * limit).limit(limit).lean(),
            Restaurant.countDocuments(filter),
        ]);
        return res.json({ stores, total, totalPages: Math.ceil(total / limit), page, limit });
    }

    const stores = await Restaurant.find(filter).select("-menu").lean();
    const ranked = stores
        .map((s) => ({
            ...s,
            distanceKm: Math.round(haversineKm([userLng!, userLat!], s.location.coordinates as [number, number]) * 10) / 10,
        }))
        .sort((a, b) => rankScore(b.adminRating, b.orderCount, b.featured, b.distanceKm) - rankScore(a.adminRating, a.orderCount, a.featured, a.distanceKm));

    return res.json({ stores: ranked.slice((page - 1) * limit, page * limit), total: ranked.length, totalPages: Math.ceil(ranked.length / limit), page, limit });
};

// GET /api/v1/grocery/details/:slug
export const getGroceryStoreBySlug = async (req: Request, res: Response) => {
    const store = await Restaurant.findOne({ slug: req.params.slug, isActive: true, storeType: "grocery" }).lean();
    if (!store) throw new NotFoundException("Grocery store not found");

    return res.json({
        store: {
            _id: store._id, name: store.name, slug: store.slug, storeType: store.storeType,
            description: store.description, address: store.address, location: store.location,
            phone: store.phone, email: store.email, logo: store.logo, coverImage: store.coverImage,
            adminRating: store.adminRating, featured: store.featured, orderCount: store.orderCount, createdAt: store.createdAt,
        },
    });
};

// ═════════════════════════════════════════════════════════════════════════════
// STORE — ADMIN
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/grocery/admin/create
export const createGroceryStore = async (req: Request, res: Response) => {
    const { name, description, address, phone, email, logo, coverImage, lat, lng } = req.body;
    let slug: string = req.body.slug ? req.body.slug : slugify(name);
    if (await Restaurant.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`;

    const store = await Restaurant.create({
        name, slug, storeType: "grocery", description, address,
        location: { type: "Point", coordinates: [Number(lng), Number(lat)] },
        phone, email, logo, coverImage,
    });
    return res.status(201).json({ message: "Grocery store created", store });
};

// PUT /api/v1/grocery/admin/update/:id
export const updateGroceryStore = async (req: Request, res: Response) => {
    const store = await Restaurant.findOne({ _id: req.params.id, storeType: "grocery" });
    if (!store) throw new NotFoundException("Grocery store not found");

    const { name, slug, description, address, phone, email, logo, coverImage, isActive, featured, lat, lng } = req.body;
    if (slug && slug !== store.slug && await Restaurant.findOne({ slug }))
        throw new BadRequestException("Slug already in use");

    const location = lat !== undefined && lng !== undefined
        ? { type: "Point" as const, coordinates: [Number(lng), Number(lat)] as [number, number] }
        : store.location;

    const updated = await Restaurant.findByIdAndUpdate(req.params.id, {
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
    }, { new: true, runValidators: true });

    return res.json({ message: "Grocery store updated", store: updated });
};

// PATCH /api/v1/grocery/admin/set-rating/:id
export const setGroceryRating = async (req: Request, res: Response) => {
    const store = await Restaurant.findOneAndUpdate(
        { _id: req.params.id, storeType: "grocery" },
        { adminRating: Number(req.body.rating) },
        { new: true, runValidators: true }
    );
    if (!store) throw new NotFoundException("Grocery store not found");
    return res.json({ message: "Rating updated", adminRating: store.adminRating });
};

// DELETE /api/v1/grocery/admin/delete/:id
export const deleteGroceryStore = async (req: Request, res: Response) => {
    const store = await Restaurant.findOneAndDelete({ _id: req.params.id, storeType: "grocery" });
    if (!store) throw new NotFoundException("Grocery store not found");
    return res.json({ message: "Grocery store deleted" });
};

// ═════════════════════════════════════════════════════════════════════════════
// PRODUCTS — PUBLIC
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/v1/grocery/products/:storeId?category=&search=&page=&limit=&minPrice=&maxPrice=&sort=
export const getGroceryProducts = async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const search = (req.query.search as string) || "";
    const categorySlug = (req.query.category as string) || "";
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const sort = (req.query.sort as string) || "";

    const store = await Restaurant.findOne({ _id: storeId, storeType: "grocery", isActive: true });
    if (!store) throw new NotFoundException("Grocery store not found");

    const filter: any = { store: storeId, isActive: true };
    if (search) filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
    ];
    if (categorySlug) {
        const cat = await Category.findOne({ slug: categorySlug });
        if (cat) filter.categories = { $in: [cat._id] };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
        filter["variants.price"] = {};
        if (minPrice !== undefined) filter["variants.price"].$gte = minPrice;
        if (maxPrice !== undefined) filter["variants.price"].$lte = maxPrice;
    }

    const sortOptions: any = {};
    switch (sort) {
        case "priceAsc": sortOptions["variants.price"] = 1; break;
        case "priceDesc": sortOptions["variants.price"] = -1; break;
        case "newest": sortOptions.createdAt = -1; break;
        default: sortOptions.createdAt = -1; break;
    }

    const [products, total] = await Promise.all([
        Product.find(filter).populate("categories", "name slug").sort(sortOptions).skip((page - 1) * limit).limit(limit),
        Product.countDocuments(filter),
    ]);
    return res.json({ products, total, totalPages: Math.ceil(total / limit), page, limit });
};

// GET /api/v1/grocery/product/:productId
export const getGroceryProductById = async (req: Request, res: Response) => {
    const product = await Product.findById(req.params.productId)
        .populate("categories", "name slug")
        .populate("store", "name slug");
    if (!product) throw new NotFoundException("Product not found");
    return res.json({ product });
};

// GET /api/v1/grocery/categories/:storeId
export const getGroceryCategories = async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const store = await Restaurant.findOne({ _id: storeId, storeType: "grocery", isActive: true });
    if (!store) throw new NotFoundException("Grocery store not found");

    const categoryIds = await Product.distinct("categories", { store: storeId, isActive: true });
    const categories = await Category.find({ _id: { $in: categoryIds } }).sort({ ordering: 1, name: 1 });
    return res.json({ categories });
};

// ═════════════════════════════════════════════════════════════════════════════
// PRODUCTS — ADMIN
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/grocery/admin/product/add
export const addGroceryProduct = async (req: Request, res: Response) => {
    const { name, description, category, storeId, slug } = req.body;
    if (!name) throw new BadRequestException("Product name is required");
    if (!category) throw new BadRequestException("Category is required");
    if (!storeId) throw new BadRequestException("storeId is required");

    const store = await Restaurant.findOne({ _id: storeId, storeType: "grocery" });
    if (!store) throw new NotFoundException("Grocery store not found");

    const variants = await parseVariants(req);
    let tags: string[] = [];
    try { tags = req.body.tags ? JSON.parse(req.body.tags) : []; } catch { tags = []; }

    const product = await Product.create({
        name, description, slug: slug || undefined,
        categories: [category], store: storeId, variants, tags, isActive: true,
    });
    return res.status(201).json({ message: "Product added", product });
};

// PUT /api/v1/grocery/admin/product/update/:productId
export const updateGroceryProduct = async (req: Request, res: Response) => {
    const existing = await Product.findById(req.params.productId);
    if (!existing) throw new NotFoundException("Product not found");

    const { name, description, category, slug } = req.body;
    const variants = await parseVariants(req);
    let tags: string[] = existing.tags ?? [];
    try { if (req.body.tags) tags = JSON.parse(req.body.tags); } catch { tags = existing.tags ?? []; }

    const updated = await Product.findByIdAndUpdate(
        req.params.productId,
        {
            name: name ?? existing.name,
            description: description ?? existing.description,
            slug: slug ?? existing.slug,
            categories: category ? [category] : existing.categories,
            variants, tags,
        },
        { new: true }
    ).populate("categories", "name slug");

    if (!updated) throw new InternalServerException("Unable to update product");
    return res.json({ message: "Product updated", product: updated });
};

// PATCH /api/v1/grocery/admin/product/toggle/:productId
export const toggleGroceryProduct = async (req: Request, res: Response) => {
    const product = await Product.findById(req.params.productId);
    if (!product) throw new NotFoundException("Product not found");
    product.isActive = !product.isActive;
    await product.save();
    return res.json({ message: `Product ${product.isActive ? "activated" : "deactivated"}`, isActive: product.isActive });
};

// DELETE /api/v1/grocery/admin/product/delete/:productId
export const deleteGroceryProduct = async (req: Request, res: Response) => {
    const product = await Product.findByIdAndDelete(req.params.productId);
    if (!product) throw new NotFoundException("Product not found");
    return res.json({ message: "Product deleted" });
};

// ═════════════════════════════════════════════════════════════════════════════
// INVENTORY ALERTS — ADMIN
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/v1/grocery/admin/expiring-products?days=3
export const getExpiringProducts = async (req: Request, res: Response) => {
    const days = Number(req.query.days) || 3;
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const products = await Product.find({ isActive: true, "variants.expiryDate": { $lte: cutoff, $gte: new Date() } })
        .populate("store", "name slug").populate("categories", "name slug").sort({ "variants.expiryDate": 1 });
    return res.json({ total: products.length, products });
};

// GET /api/v1/grocery/admin/low-stock?threshold=10
export const getLowStockProducts = async (req: Request, res: Response) => {
    const threshold = Number(req.query.threshold) || 10;
    const products = await Product.find({ isActive: true, "variants.stock": { $lte: threshold } })
        .populate("store", "name slug").populate("categories", "name slug").sort({ "variants.stock": 1 });
    return res.json({ total: products.length, products });
};
