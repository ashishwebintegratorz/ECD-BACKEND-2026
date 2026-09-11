import { Request, Response } from "express";
import City from "../models/City.model.js";
import DeliveryZone from "../models/DeliveryZone.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/v1/cities/active (List all active cities for apps)
// ─────────────────────────────────────────────────────────────────────────────
export const getActiveCities = async (req: Request, res: Response) => {
  try {
    const cities = await City.find({ isActive: true }).sort({ name: 1 }).lean();

    const formattedCities = await Promise.all(
      cities.map(async (c) => {
        let lat = c.coordinates?.lat || 0;
        let lng = c.coordinates?.lng || 0;

        if (lat === 0 && lng === 0) {
          const zone = await DeliveryZone.findOne({
            $or: [
              { cityId: c._id },
              { city: { $regex: `^${c.name.trim()}$`, $options: "i" } },
              { name: { $regex: `^${c.name.trim()}`, $options: "i" } },
            ],
            isActive: true,
          }).lean();

          if (zone && zone.center && (zone.center.lat !== 0 || zone.center.lng !== 0)) {
            lat = zone.center.lat;
            lng = zone.center.lng;
            // Background update
            City.findByIdAndUpdate(c._id, {
              coordinates: { lat, lng },
            }).catch(() => {});
          }
        }

        return {
          _id: c._id,
          name: c.name,
          state: c.state || "",
          coordinates: { lat, lng },
          isActive: c.isActive,
        };
      })
    );

    return res.json({
      success: true,
      totalCities: formattedCities.length,
      cities: formattedCities,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch active cities",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /api/v1/cities (List all cities with search/filter)
// ─────────────────────────────────────────────────────────────────────────────
export const getAllCities = async (req: Request, res: Response) => {
  try {
    const { search, isActive } = req.query;
    const query: any = {};
    if (isActive !== undefined) query.isActive = isActive === "true";
    if (search) {
      query.$or = [
        { name: { $regex: String(search), $options: "i" } },
        { state: { $regex: String(search), $options: "i" } },
      ];
    }

    const cities = await City.find(query).sort({ name: 1 }).lean();
    const totalCities = await City.countDocuments(query);
    const activeCities = await City.countDocuments({ ...query, isActive: true });

    const formattedCities = await Promise.all(
      cities.map(async (c) => {
        let lat = c.coordinates?.lat || 0;
        let lng = c.coordinates?.lng || 0;

        if (lat === 0 && lng === 0) {
          const zone = await DeliveryZone.findOne({
            $or: [
              { cityId: c._id },
              { city: { $regex: `^${c.name.trim()}$`, $options: "i" } },
              { name: { $regex: `^${c.name.trim()}`, $options: "i" } },
            ],
            isActive: true,
          }).lean();

          if (zone && zone.center && (zone.center.lat !== 0 || zone.center.lng !== 0)) {
            lat = zone.center.lat;
            lng = zone.center.lng;
            City.findByIdAndUpdate(c._id, {
              coordinates: { lat, lng },
            }).catch(() => {});
          }
        }

        return {
          ...c,
          coordinates: { lat, lng },
        };
      })
    );

    return res.json({
      success: true,
      totalCities,
      activeCities,
      cities: formattedCities,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch cities",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /api/v1/cities (Create or update City)
// ─────────────────────────────────────────────────────────────────────────────
export const createCity = async (req: Request, res: Response) => {
  try {
    const { name, state, lat, lng, isActive } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "City name is required" });
    }

    const cityName = name.trim();
    const existing = await City.findOne({
      name: { $regex: `^${cityName}$`, $options: "i" },
    });

    if (existing) {
      if (state !== undefined) existing.state = state.trim();
      if (lat !== undefined && lng !== undefined) {
        existing.coordinates = { lat: Number(lat), lng: Number(lng) };
      }
      if (isActive !== undefined) existing.isActive = Boolean(isActive);
      await existing.save();

      return res.json({
        success: true,
        message: `City '${cityName}' updated successfully`,
        city: existing,
      });
    }

    const newCity = await City.create({
      name: cityName,
      state: state ? state.trim() : "",
      coordinates: {
        lat: lat ? Number(lat) : 0,
        lng: lng ? Number(lng) : 0,
      },
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return res.status(201).json({
      success: true,
      message: `City '${cityName}' created successfully`,
      city: newCity,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create city",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PUT /api/v1/cities/:id (Update City)
// ─────────────────────────────────────────────────────────────────────────────
export const updateCity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, state, lat, lng, isActive } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (state !== undefined) updates.state = state.trim();
    if (lat !== undefined && lng !== undefined) {
      updates.coordinates = { lat: Number(lat), lng: Number(lng) };
    }
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const updated = await City.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: "City not found" });
    }

    return res.json({
      success: true,
      message: `City '${updated.name}' updated successfully`,
      city: updated,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update city",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: DELETE /api/v1/cities/:id (Delete City)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteCity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await City.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "City not found" });
    }

    // Also deactivate or unlink delivery zones under this city
    await DeliveryZone.updateMany({ cityId: id }, { isActive: false });

    return res.json({
      success: true,
      message: `City '${deleted.name}' deleted successfully`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete city",
    });
  }
};
