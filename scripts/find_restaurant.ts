import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import Restaurant from "../models/Restaurant.model.js";

async function find() {
  await mongoose.connect(process.env.MONGO_URI || "");
  const r = await Restaurant.findOne({
    $or: [
      { phone: "+917008452720" },
      { phone: "7008452720" },
      { phone: { $regex: "7008452720" } }
    ]
  });
  console.log("Found Restaurant:", r ? {
    _id: r._id.toString(),
    restaurantId: r.restaurantId,
    name: r.name,
    slug: r.slug,
    phone: r.phone
  } : "Not found, listing all restaurants:");

  if (!r) {
    const all = await Restaurant.find().limit(5);
    console.log(all.map(a => ({ _id: a._id.toString(), restaurantId: a.restaurantId, name: a.name, slug: a.slug, phone: a.phone })));
  }

  await mongoose.disconnect();
}
find();
