import { Request, Response } from "express";
import PopularDish from "../models/PopularDish.model.js";
import cloudinary from "../config/cloudinary.js";
import { BadRequestException, NotFoundException } from "../utils/appError.js";

// Helper to upload image to Cloudinary
const uploadToCloudinary = (file: Express.Multer.File): Promise<string> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "popular_dishes" },
      (err, result) => {
        if (err || !result) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(file.buffer);
  });

// Create slug helper
const toSlug = (name: string) =>
  name.toLowerCase().trim().replace(/\s+/g, "-");

export const getAllPopularDishes = async (req: Request, res: Response) => {
  const dishes = await PopularDish.find({ isActive: true }).sort({ ordering: 1 }).lean();
  return res.json({ success: true, dishes });
};

export const addPopularDish = async (req: Request, res: Response) => {
  const { name, category, ordering, image } = req.body;
  if (!name) throw new BadRequestException("Dish name is required");

  let imageUrl = image;
  if (req.file) {
    imageUrl = await uploadToCloudinary(req.file);
  }

  if (!imageUrl) throw new BadRequestException("Image file or URL is required");

  const dish = await PopularDish.create({
    name,
    slug: toSlug(name),
    image: imageUrl,
    category,
    ordering: ordering ? parseInt(ordering) : 0,
  });

  return res.status(201).json({ success: true, dish });
};

export const updatePopularDish = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, category, ordering, isActive, image } = req.body;

  const dish = await PopularDish.findById(id);
  if (!dish) throw new NotFoundException("Dish not found");

  if (name) {
    dish.name = name;
    dish.slug = toSlug(name);
  }
  if (category) dish.category = category;
  if (ordering) dish.ordering = parseInt(ordering);
  if (isActive !== undefined) dish.isActive = isActive === "true" || isActive === true;

  if (req.file) {
    dish.image = await uploadToCloudinary(req.file);
  }

  await dish.save();
  return res.json({ success: true, dish });
};

export const deletePopularDish = async (req: Request, res: Response) => {
  const { id } = req.params;
  const dish = await PopularDish.findByIdAndDelete(id);
  if (!dish) throw new NotFoundException("Dish not found");
  return res.json({ success: true, message: "Dish deleted successfully" });
};
