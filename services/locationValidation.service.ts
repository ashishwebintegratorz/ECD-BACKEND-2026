import City, { ICity } from "../models/City.model.js";
import DeliveryZone, { IDeliveryZone } from "../models/DeliveryZone.model.js";
import { Types } from "mongoose";

// Helper: Haversine distance in km
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

// Helper: Point in Polygon (Ray-casting Algorithm)
// point: [lng, lat], polygon: [[lng, lat], ...]
export function isPointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  if (!polygon || polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

export interface ILocationValidationResult {
  isValid: boolean;
  city: ICity | null;
  matchedZone: IDeliveryZone | null;
  message: string;
}

/**
 * Centralized service to validate customer GPS location against active Zones belonging to the selected City.
 */
export async function validateCustomerLocationAndZone(
  cityId: string,
  latitude: number,
  longitude: number
): Promise<ILocationValidationResult> {
  // 1. Check all active zones by GPS coordinates first if valid coordinates are supplied
  if (!isNaN(latitude) && !isNaN(longitude) && (latitude !== 0 || longitude !== 0)) {
    const allActiveZones = await DeliveryZone.find({ isActive: true }).populate("cityId").lean();
    for (const zone of allActiveZones) {
      if (
        zone.polygonCoordinates &&
        Array.isArray(zone.polygonCoordinates) &&
        zone.polygonCoordinates.length >= 3
      ) {
        if (isPointInPolygon([longitude, latitude], zone.polygonCoordinates)) {
          let cDoc = (zone.cityId as any) || null;
          if (!cDoc && (zone as any).city) {
            cDoc = await City.findOne({ name: { $regex: `^${(zone as any).city.trim()}$`, $options: "i" }, isActive: true }).lean();
          }
          return {
            isValid: true,
            city: cDoc,
            matchedZone: zone as any,
            message: `Location is within '${zone.name}' delivery boundary.`,
          };
        }
      }

      const center = zone.center || { lat: 28.4595, lng: 77.0266 };
      const radius = zone.radiusKm || 15;
      const dist = calculateDistanceKm(latitude, longitude, center.lat, center.lng);

      if (dist <= radius) {
        let cDoc = (zone.cityId as any) || null;
        if (!cDoc && (zone as any).city) {
          cDoc = await City.findOne({ name: { $regex: `^${(zone as any).city.trim()}$`, $options: "i" }, isActive: true }).lean();
        }
        return {
          isValid: true,
          city: cDoc,
          matchedZone: zone as any,
          message: `Location is within '${zone.name}' delivery boundary.`,
        };
      }
    }
  }

  // 2. Fallback: Validate by cityId if provided
  let cityDoc: ICity | null = null;
  if (cityId) {
    if (Types.ObjectId.isValid(cityId)) {
      cityDoc = await City.findOne({ _id: cityId, isActive: true });
    }
    if (!cityDoc) {
      cityDoc = await City.findOne({
        name: { $regex: `^${cityId.trim()}$`, $options: "i" },
        isActive: true,
      });
    }
  }

  if (!cityDoc) {
    const allActiveZones = await DeliveryZone.countDocuments({ isActive: true });
    if (allActiveZones === 0) {
      return {
        isValid: true,
        city: null,
        matchedZone: null,
        message: "Delivery is available in your area.",
      };
    }
    return {
      isValid: false,
      city: null,
      matchedZone: null,
      message: "Delivery is not available in your current location.",
    };
  }

  // 2. Load active Zones where cityId matches the selected City
  const activeZones = await DeliveryZone.find({
    $or: [
      { cityId: cityDoc._id, isActive: true },
      { city: { $regex: `^${cityDoc.name.trim()}$`, $options: "i" }, isActive: true },
      { state: { $regex: `^${cityDoc.name.trim()}$`, $options: "i" }, isActive: true },
      { name: { $regex: `^${cityDoc.name.trim()}`, $options: "i" }, isActive: true },
    ],
    isActive: true,
  });

  // DEFAULT BEHAVIOR: If no active delivery zones/sub-areas exist in this city (or if user deleted them),
  // delivery is automatically available everywhere for that city!
  if (!activeZones || activeZones.length === 0) {
    return {
      isValid: true,
      city: cityDoc,
      matchedZone: null,
      message: `Delivery is available in ${cityDoc.name}.`,
    };
  }

  // If coordinates are 0,0 or missing, use city coordinates if available
  if (isNaN(latitude) || isNaN(longitude) || (latitude === 0 && longitude === 0)) {
    if (cityDoc.coordinates && (cityDoc.coordinates.lat !== 0 || cityDoc.coordinates.lng !== 0)) {
      latitude = cityDoc.coordinates.lat;
      longitude = cityDoc.coordinates.lng;
    } else {
      return {
        isValid: true,
        city: cityDoc,
        matchedZone: activeZones[0],
        message: `Delivery is available in ${cityDoc.name}.`,
      };
    }
  }

  // 3. Check whether GPS coordinates fall inside one of those zone polygons or radius
  let matchedZone: IDeliveryZone | null = null;

  for (const zone of activeZones) {
    // Check polygon if available
    if (
      zone.polygonCoordinates &&
      Array.isArray(zone.polygonCoordinates) &&
      zone.polygonCoordinates.length >= 3
    ) {
      if (isPointInPolygon([longitude, latitude], zone.polygonCoordinates)) {
        matchedZone = zone;
        break;
      }
    }

    // Check circular radius
    const center = zone.center || { lat: 28.4595, lng: 77.0266 };
    const radius = zone.radiusKm || 15;
    const dist = calculateDistanceKm(latitude, longitude, center.lat, center.lng);

    if (dist <= radius) {
      matchedZone = zone;
      break;
    }
  }

  if (matchedZone) {
    return {
      isValid: true,
      city: cityDoc,
      matchedZone,
      message: `Location is within '${matchedZone.name}' delivery boundary in ${cityDoc.name}.`,
    };
  }

  return {
    isValid: false,
    city: cityDoc,
    matchedZone: null,
    message: "Delivery is not available in your current location.",
  };
}
