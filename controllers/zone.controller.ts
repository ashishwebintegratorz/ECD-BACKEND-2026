import { Request, Response } from "express";
import DeliveryZone from "../models/DeliveryZone.model.js";
import City from "../models/City.model.js";
import { validateCustomerLocationAndZone } from "../services/locationValidation.service.js";
import { Types } from "mongoose";

// Helper: Haversine distance in km
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /api/v1/zones (List all Delivery Zones, optionally by cityId)
// ─────────────────────────────────────────────────────────────────────────────
export const getAllZones = async (req: Request, res: Response) => {
  const { search, isActive, cityId } = req.query;

  const query: any = {};
  if (isActive !== undefined) query.isActive = isActive === "true";
  if (cityId) {
    if (Types.ObjectId.isValid(String(cityId))) {
      query.cityId = cityId;
    }
  }
  if (search) {
    query.$or = [
      { name: { $regex: String(search), $options: "i" } },
      { state: { $regex: String(search), $options: "i" } },
      { city: { $regex: String(search), $options: "i" } },
    ];
  }

  const zones = await DeliveryZone.find(query)
    .populate("cityId", "name state")
    .sort({ createdAt: -1 })
    .lean();
  const totalZones = await DeliveryZone.countDocuments(query);
  const activeZones = await DeliveryZone.countDocuments({ ...query, isActive: true });

  // Map to clean format
  const formattedZones = zones.map((z: any) => ({
    _id: z._id,
    cityId: z.cityId?._id || z.cityId,
    cityName: z.cityId?.name || z.city || z.state || "",
    name: z.name || z.state || z.city || "Delivery Zone",
    center: z.center || { lat: 28.4595, lng: 77.0266 },
    radiusKm: z.radiusKm || 15,
    polygonCoordinates: z.polygonCoordinates,
    isActive: z.isActive !== false,
    createdAt: z.createdAt,
  }));

  return res.json({
    success: true,
    totalZones,
    activeZones,
    zones: formattedZones,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC / APP: GET /api/v1/zones/active (List active zones, optionally by cityId)
// ─────────────────────────────────────────────────────────────────────────────
export const getActiveZones = async (req: Request, res: Response) => {
  const { cityId } = req.query;
  const query: any = { isActive: true };

  if (cityId) {
    if (Types.ObjectId.isValid(String(cityId))) {
      query.cityId = cityId;
    } else {
      query.$or = [
        { city: { $regex: `^${String(cityId).trim()}$`, $options: "i" } },
        { name: { $regex: `^${String(cityId).trim()}`, $options: "i" } },
      ];
    }
  }

  const active = await DeliveryZone.find(query).populate("cityId", "name state").lean();

  const activeList = active.map((z: any) => ({
    _id: z._id,
    cityId: z.cityId?._id || z.cityId,
    cityName: z.cityId?.name || z.city || "",
    name: z.name || z.state || z.city || "Delivery Zone",
    center: z.center || { lat: 28.4595, lng: 77.0266 },
    radiusKm: z.radiusKm || 15,
    polygonCoordinates: z.polygonCoordinates,
  }));

  const zoneNames = activeList.map((z) => z.name);

  return res.json({
    success: true,
    activeCities: zoneNames,
    totalActiveAreas: activeList.length,
    zones: activeList,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /api/v1/zones (Create a new Delivery Zone with City)
// ─────────────────────────────────────────────────────────────────────────────
export const createCityZone = async (req: Request, res: Response) => {
  const { name, state, city, cityId, lat, lng, radiusKm, polygonCoordinates, isActive } = req.body;
  const zoneName = (name || state || city || "Delivery Zone").trim();

  // Find or link City
  let resolvedCityId = cityId;
  if (!resolvedCityId && (city || state || name)) {
    const searchCity = (city || state || name).trim();
    let matchedCity = await City.findOne({
      name: { $regex: `^${searchCity}$`, $options: "i" },
    });
    if (!matchedCity) {
      matchedCity = await City.create({
        name: searchCity,
        state: state || "",
        isActive: true,
      });
    }
    resolvedCityId = matchedCity._id;
  }

  // Check if zone already exists with same name & cityId
  const existing = await DeliveryZone.findOne({
    $or: [
      { name: { $regex: `^${zoneName}$`, $options: "i" } },
      { state: { $regex: `^${zoneName}$`, $options: "i" } },
    ],
  });

  if (existing) {
    if (resolvedCityId) existing.cityId = resolvedCityId;
    if (lat !== undefined && lng !== undefined) {
      existing.center = { lat: Number(lat), lng: Number(lng) };
    }
    if (radiusKm !== undefined) {
      existing.radiusKm = Number(radiusKm);
    }
    if (polygonCoordinates !== undefined) {
      existing.polygonCoordinates = polygonCoordinates;
    }
    if (isActive !== undefined) {
      existing.isActive = Boolean(isActive);
    }
    existing.name = zoneName;
    await existing.save();

    return res.status(200).json({
      success: true,
      message: `Delivery Zone '${zoneName}' updated successfully`,
      zone: existing,
    });
  }

  const newZone = await DeliveryZone.create({
    cityId: resolvedCityId,
    name: zoneName,
    state: state || zoneName,
    city: city || zoneName,
    center: {
      lat: lat ? Number(lat) : 28.4595,
      lng: lng ? Number(lng) : 77.0266,
    },
    radiusKm: Number(radiusKm) || 15,
    polygonCoordinates: polygonCoordinates || undefined,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  });

  return res.status(201).json({
    success: true,
    message: `Delivery Zone '${zoneName}' created successfully`,
    zone: newZone,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /api/v1/zones/:id (Update Delivery Zone)
// ─────────────────────────────────────────────────────────────────────────────
export const updateCityZone = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, state, city, cityId, lat, lng, radiusKm, polygonCoordinates, isActive } = req.body;

  const updates: any = {};
  if (cityId !== undefined) updates.cityId = cityId;
  if (name !== undefined) updates.name = name.trim();
  if (state !== undefined) updates.state = state.trim();
  if (city !== undefined) updates.city = city.trim();
  if (lat !== undefined && lng !== undefined) {
    updates.center = { lat: Number(lat), lng: Number(lng) };
  }
  if (radiusKm !== undefined) updates.radiusKm = Number(radiusKm);
  if (polygonCoordinates !== undefined) updates.polygonCoordinates = polygonCoordinates;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);

  const updated = await DeliveryZone.findByIdAndUpdate(id, updates, { new: true });
  if (!updated) {
    return res.status(404).json({ success: false, message: "Delivery Zone not found" });
  }

  return res.json({
    success: true,
    message: "Delivery Zone updated successfully",
    zone: updated,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: DELETE /api/v1/zones/:id (Delete Delivery Zone)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteCityZone = async (req: Request, res: Response) => {
  const { id } = req.params;

  const deleted = await DeliveryZone.findByIdAndDelete(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: "Delivery Zone not found" });
  }

  return res.json({
    success: true,
    message: `Delivery Zone '${deleted.name || deleted.state || "Zone"}' deleted successfully.`,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Sub-Area stubs to keep router backwards compatible
// ─────────────────────────────────────────────────────────────────────────────
export const addSubArea = async (req: Request, res: Response) => {
  return createCityZone(req, res);
};

export const updateSubArea = async (req: Request, res: Response) => {
  return updateCityZone(req, res);
};

export const deleteSubArea = async (req: Request, res: Response) => {
  return deleteCityZone(req, res);
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC / APP: GET /api/v1/zones/check?lat=...&lng=...&cityId=...
// ─────────────────────────────────────────────────────────────────────────────
export const checkLocationZone = async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const cityId = req.query.cityId ? String(req.query.cityId) : "";

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, message: "Valid lat and lng query params are required" });
  }

  if (cityId) {
    const result = await validateCustomerLocationAndZone(cityId, lat, lng);
    if (result.isValid && result.matchedZone) {
      return res.json({
        success: true,
        inZone: true,
        deliveryAvailable: true,
        cityId: result.city?._id?.toString(),
        cityName: result.city?.name,
        zoneId: result.matchedZone._id.toString(),
        zoneName: result.matchedZone.name,
        message: result.message,
        matchedZone: {
          name: result.matchedZone.name,
          radiusKm: result.matchedZone.radiusKm,
        },
      });
    } else {
      return res.json({
        success: false,
        inZone: false,
        deliveryAvailable: false,
        message: result.message,
        activeCities: [],
      });
    }
  }

  // Fallback for requests without cityId (check all active zones)
  const activeZones = await DeliveryZone.find({ isActive: true }).lean();

  if (activeZones.length === 0) {
    return res.json({
      success: true,
      inZone: true,
      message: "Service available",
      matchedZone: null,
      activeCities: [],
    });
  }

  let matchedZone: any = null;
  let closestDistanceKm = Infinity;

  for (const zone of activeZones) {
    const center = zone.center || { lat: 28.4595, lng: 77.0266 };
    const radius = zone.radiusKm || 15;
    const dist = calculateDistanceKm(lat, lng, center.lat, center.lng);

    if (dist <= radius) {
      matchedZone = {
        name: zone.name || zone.state || zone.city || "Delivery Zone",
        radiusKm: radius,
        distanceFromCenterKm: Math.round(dist * 10) / 10,
      };
      break;
    }

    if (dist < closestDistanceKm) {
      closestDistanceKm = dist;
    }
  }

  const activeZoneNames = activeZones.map((z) => z.name || z.state || z.city || "Zone");

  if (matchedZone) {
    return res.json({
      success: true,
      inZone: true,
      message: `Location is within '${matchedZone.name}' delivery boundary`,
      matchedZone,
      activeCities: activeZoneNames,
    });
  } else {
    return res.json({
      success: true,
      inZone: false,
      message: `Services are not available at this location. We currently operate in: ${activeZoneNames.join(", ")}`,
      nearestZoneDistanceKm: Math.round(closestDistanceKm * 10) / 10,
      activeCities: activeZoneNames,
    });
  }
};
