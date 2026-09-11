import { Request, Response } from "express";
import { validateCustomerLocationAndZone } from "../services/locationValidation.service.js";
import City from "../models/City.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL LOCATION & ZONE VALIDATION API: POST /api/v1/location/check-zone
// ─────────────────────────────────────────────────────────────────────────────
export const checkLocationZone = async (req: Request, res: Response) => {
  try {
    const { cityId, latitude, longitude, lat, lng } = req.body;

    const parsedLat = Number(latitude !== undefined ? latitude : lat);
    const parsedLng = Number(longitude !== undefined ? longitude : lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({
        success: false,
        deliveryAvailable: false,
        message: "Valid GPS latitude and longitude coordinates are required.",
      });
    }

    const result = await validateCustomerLocationAndZone(
      String(cityId || ""),
      parsedLat,
      parsedLng
    );

    if (result.isValid) {
      return res.json({
        success: true,
        deliveryAvailable: true,
        cityId: result.city?._id?.toString() || cityId,
        cityName: result.city?.name || "",
        zoneId: result.matchedZone?._id?.toString() || "",
        zoneName: result.matchedZone?.name || (result.city ? `${result.city.name} General` : "All Areas"),
        message: result.message,
      });
    } else {
      return res.json({
        success: false,
        deliveryAvailable: false,
        cityId: result.city?._id?.toString() || cityId,
        cityName: result.city?.name || "",
        message:
          result.message ||
          "Delivery is not available in your current location.",
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      deliveryAvailable: false,
      message: error.message || "Failed to validate location zone.",
    });
  }
};

import DeliveryZone from "../models/DeliveryZone.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/location/cities (Helper for active cities list)
// ─────────────────────────────────────────────────────────────────────────────
export const getLocationCities = async (req: Request, res: Response) => {
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
        };
      })
    );

    return res.json({
      success: true,
      cities: formattedCities,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch cities.",
    });
  }
};
