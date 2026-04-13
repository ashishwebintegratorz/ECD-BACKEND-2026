import { Request, Response } from "express";
import Product from "../models/Product.model.js";
import Category from "../models/Category.model.js";
import cloudinary from "../config/cloudinary.js";
import {
  BadRequestException,
  NotFoundException,
  InternalServerException,
} from "../utils/appError.js";

// -------------------------------
// Cloudinary Upload Helper
// -------------------------------
const uploadToCloudinary = (file: Express.Multer.File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "products" },
      (err, result) => {
        if (err || !result) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(file.buffer);
  });
};

// -------------------------------
// Helper: Parse Variants (JSON + Images)
// -------------------------------
const parseVariants = async (req: Request) => {
  let variants = [];

  try {
    variants = JSON.parse(req.body.variants || "[]");
  } catch (err) {
    throw new BadRequestException("Invalid variants format. Must be JSON.");
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    throw new BadRequestException("At least one variant is required");
  }

  const files = req.files as Express.Multer.File[];

  for (let i = 0; i < variants.length; i++) {
    const variantFiles = files.filter(
      (f) => f.fieldname === `variantImages_${i}`
    );

    const uploadedUrls: string[] = [];

    for (const file of variantFiles) {
      const url = await uploadToCloudinary(file);
      uploadedUrls.push(url);
    }

    // keep existing images when editing
    const oldImages =
      variants[i].images?.filter((url: string) => url.startsWith("http")) || [];

    variants[i].images = [...oldImages, ...uploadedUrls];

    variants[i].price = Number(variants[i].price);
    variants[i].mrp = variants[i].mrp ? Number(variants[i].mrp) : undefined;
    variants[i].stock = Number(variants[i].stock);
  }

  return variants;
};

// ----------------------------
// 1️⃣ Add Product
// ----------------------------
export const addProduct = async (req: Request, res: Response) => {
  const { name, description, category } = req.body;

  if (!name) throw new BadRequestException("Product name is required");
  if (!category) throw new BadRequestException("Category is required");

  const variants = await parseVariants(req);

  const product = await Product.create({
    name,
    description,
    categories: [category],
    variants,
  });

  return res.status(201).json({
    message: "Product created successfully",
    product,
  });
};

// ----------------------------
// 2️⃣ Get All Products (Pagination)
// ----------------------------
export const getAllProducts = async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = (req.query.search as string) || "";
  const category = (req.query.category as string) || "";
  const minPrice = Number(req.query.minPrice) || undefined;
  const maxPrice = Number(req.query.maxPrice) || undefined;
  const sort = (req.query.sort as string) || ""; // priceAsc, priceDesc, newest, oldest

  const filter: any = {};

  // --------------------------------------
  // 1️⃣ SEARCH SUPPORT (name, desc, sku)
  // --------------------------------------
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { "variants.sku": { $regex: search, $options: "i" } },
      { "variants.attributes": { $regex: search, $options: "i" } },
    ];

    // Search category names
    const categoryDocs = await Category.find({
      name: { $regex: search, $options: "i" },
    }).select("_id");

    if (categoryDocs.length > 0) {
      filter.$or.push({
        categories: { $in: categoryDocs.map((c) => c._id) },
      });
    }
  }

  // --------------------------------------
  // 2️⃣ CATEGORY FILTER
  // --------------------------------------
  if (category) {
    const cat = await Category.findOne({ slug: category });
    if (cat) {
      filter.categories = { $in: [cat._id] };
    }
  }

  // --------------------------------------
  // 3️⃣ PRICE FILTERING THROUGH VARIANTS
  // --------------------------------------
  if (minPrice || maxPrice) {
    filter["variants.price"] = {};
    if (minPrice) filter["variants.price"].$gte = minPrice;
    if (maxPrice) filter["variants.price"].$lte = maxPrice;
  }

  // --------------------------------------
  // 4️⃣ SORTING
  // --------------------------------------
  const sortOptions: any = {};

  switch (sort) {
    case "priceAsc":
      sortOptions["variants.price"] = 1;
      break;
    case "priceDesc":
      sortOptions["variants.price"] = -1;
      break;
    case "newest":
      sortOptions.createdAt = -1;
      break;
    case "oldest":
      sortOptions.createdAt = 1;
      break;
    default:
      break;
  }

  // --------------------------------------
  // 5️⃣ QUERY DATABASE (with pagination)
  // --------------------------------------
  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("categories")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  return res.json({
    products,
    total,
    totalPages: Math.ceil(total / limit),
    page,
    limit,
  });
};



// ----------------------------
// 3️⃣ Get Product By ID
// ----------------------------
export const getProductById = async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id).populate("categories");

  if (!product) throw new NotFoundException("Product not found");

  return res.json({ product });
};

// ----------------------------
// 4️⃣ Get Products By Category (Slug)
// ----------------------------
export const getProductsByCategory = async (req: Request, res: Response) => {
  const category = await Category.findOne({ slug: req.params.slug });

  if (!category) throw new NotFoundException("Category not found");

  const products = await Product.find({
    categories: category._id,
    isActive: true,
  }).populate("categories");

  return res.json({ products });
};

// ----------------------------
// 5️⃣ Delete Product
// ----------------------------
export const deleteProduct = async (req: Request, res: Response) => {
  const product = await Product.findByIdAndDelete(req.params.id);

  if (!product) throw new NotFoundException("Product not found");

  return res.json({ message: "Product deleted successfully" });
};

// ----------------------------
// 6️⃣ Update Product
// ----------------------------
export const updateProduct = async (req: Request, res: Response) => {
  const { name, description, category } = req.body;

  const existing = await Product.findById(req.params.id);
  if (!existing) throw new NotFoundException("Product not found");

  const variants = await parseVariants(req);

  const updated = await Product.findByIdAndUpdate(
    req.params.id,
    {
      name: name ?? existing.name,
      description: description ?? existing.description,
      categories: category ? [category] : existing.categories,
      variants,
    },
    { new: true }
  ).populate("categories");

  if (!updated) {
    throw new InternalServerException("Unable to update product");
  }

  return res.json({
    message: "Product updated successfully",
    product: updated,
  });
};
