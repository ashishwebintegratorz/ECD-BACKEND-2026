import mongoose from "mongoose";
import "dotenv/config";
import City from "../models/City.model.js";
import DeliveryZone from "../models/DeliveryZone.model.js";
import Restaurant from "../models/Restaurant.model.js";
import { config } from "../config/app.config.js";

const DEFAULT_CITIES = [
  {
    name: "Dewas",
    state: "Madhya Pradesh",
    coordinates: { lat: 22.9676, lng: 76.0534 },
    isActive: true,
  },
  {
    name: "Indore",
    state: "Madhya Pradesh",
    coordinates: { lat: 22.7196, lng: 75.8577 },
    isActive: true,
  },
  {
    name: "Bhubaneswar",
    state: "Odisha",
    coordinates: { lat: 20.2961, lng: 85.8245 },
    isActive: true,
  },
  {
    name: "Cuttack",
    state: "Odisha",
    coordinates: { lat: 20.4625, lng: 85.8828 },
    isActive: true,
  },
  {
    name: "Gurgaon",
    state: "Haryana",
    coordinates: { lat: 28.4595, lng: 77.0266 },
    isActive: true,
  },
];

const DEFAULT_ZONES: Record<string, Array<{ name: string; lat: number; lng: number; radiusKm: number }>> = {
  Dewas: [
    { name: "Dewas Central", lat: 22.9676, lng: 76.0534, radiusKm: 15 },
    { name: "Dewas Industrial Area", lat: 22.9800, lng: 76.0700, radiusKm: 10 },
  ],
  Indore: [
    { name: "Vijay Nagar", lat: 22.7533, lng: 75.8937, radiusKm: 12 },
    { name: "Palasia & Old City", lat: 22.7244, lng: 75.8839, radiusKm: 12 },
    { name: "Bhanwarkuan & Rau", lat: 22.6868, lng: 75.8572, radiusKm: 15 },
  ],
  Bhubaneswar: [
    { name: "Bhubaneswar Central & Patia", lat: 20.2961, lng: 85.8245, radiusKm: 15 },
    { name: "Jaydev Vihar & Nayapalli", lat: 20.3015, lng: 85.8180, radiusKm: 12 },
  ],
};

async function seedCitiesAndZones() {
  const uri = process.env.MONGO_URI || config.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB for City & Zone initialization...");

  for (const cityData of DEFAULT_CITIES) {
    let city = await City.findOne({
      name: { $regex: `^${cityData.name}$`, $options: "i" },
    });

    if (!city) {
      city = await City.create(cityData);
      console.log(`[Created City] ${city.name} (${city._id})`);
    } else {
      city.isActive = true;
      if (!city.coordinates || city.coordinates.lat === 0) {
        city.coordinates = cityData.coordinates;
      }
      await city.save();
      console.log(`[Existing City Verified] ${city.name} (${city._id})`);
    }

    // Check default zones for this city
    const zonesForCity = DEFAULT_ZONES[cityData.name] || [];
    for (const z of zonesForCity) {
      let zone = await DeliveryZone.findOne({
        name: { $regex: `^${z.name}$`, $options: "i" },
      });

      if (!zone) {
        zone = await DeliveryZone.create({
          cityId: city._id,
          name: z.name,
          state: city.state || city.name,
          city: city.name,
          center: { lat: z.lat, lng: z.lng },
          radiusKm: z.radiusKm,
          isActive: true,
        });
        console.log(`  -> [Created Zone] ${zone.name} in ${city.name}`);
      } else {
        if (!zone.cityId) {
          zone.cityId = city._id as any;
          zone.isActive = true;
          await zone.save();
          console.log(`  -> [Linked Existing Zone to City] ${zone.name} -> ${city.name}`);
        }
      }
    }
  }

  // Link any unassigned restaurants to default city/zones using updateMany (bypasses full doc validation)
  const indoreCity = await City.findOne({ name: { $regex: /^Indore$/i } });
  if (indoreCity) {
    const indoreZones = await DeliveryZone.find({ cityId: indoreCity._id, isActive: true });
    const zoneIds = indoreZones.map((z) => z._id);

    const updateRes = await Restaurant.updateMany(
      { $or: [{ cityId: { $exists: false } }, { cityId: null }] },
      { $set: { cityId: indoreCity._id, zoneIds } }
    );
    console.log(`[Migrated Unassigned Restaurants] ${updateRes.modifiedCount} updated to Indore`);
  }

  console.log("City & Zone Migration Complete!");
  await mongoose.disconnect();
}

seedCitiesAndZones().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
