import { Request, Response } from "express";

const req: any = {
    query: {}
};

const page = Math.max(1, Number(req.query.page) || 1);
const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 50)); 
const search = (req.query.search as string) || "";
const storeType = (req.query.storeType as string) || "";
const userLat = req.query.lat ? Number(req.query.lat) : null;
const userLng = req.query.lng ? Number(req.query.lng) : null;
const hasCoords = userLat !== null && userLng !== null;

const dietary = req.query.dietary as string; 
const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
const minRating = req.query.minRating ? Number(req.query.minRating) : null;
const maxDistance = req.query.maxDistance ? Number(req.query.maxDistance) : null;
const status = req.query.status as string; 

const filter: any = { isActive: true };
if (storeType) filter.storeType = storeType;
if (search) {
    filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
    ];
}

if (dietary === "Veg") {
    filter["menu.foodType"] = { $in: ["veg", "vegan"] };
} else if (dietary === "Non-Veg") {
    filter["menu.foodType"] = "non-veg";
}

if (minPrice !== null || maxPrice !== null) {
    filter["menu.price"] = {};
    if (minPrice !== null) filter["menu.price"].$gte = minPrice;
    if (maxPrice !== null) filter["menu.price"].$lte = maxPrice;
}

if (minRating !== null) {
    filter.adminRating = { $gte: minRating };
}

if (status === "Open Now") {
    filter.isOnline = true;
} else if (status === "Closed") {
    filter.isOnline = false;
}

console.log("FILTER OBJECT:", JSON.stringify(filter, null, 2));
