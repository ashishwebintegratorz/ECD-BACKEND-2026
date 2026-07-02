import axios from "axios";

const GOOGLE_MAPS_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";

export interface IRoutePoint {
  lng: number;
  lat: number;
}

export interface IRouteData {
  points: [number, number][]; // [[lng, lat], ...]
  distance: number; // in meters
  duration: number; // in seconds
}

// Helper to decode Google Maps polyline string into an array of [lng, lat]
function decodePolyline(encoded: string): [number, number][] {
  let points: [number, number][] = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;
  
  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    
    points.push([lng / 1E5, lat / 1E5]);
  }
  return points;
}

export const getRouteFromORS = async (
  start: IRoutePoint,
  end: IRoutePoint
): Promise<IRouteData | null> => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_MAPS_API_KEY is not set in .env");
      return null;
    }

    const response = await axios.get(GOOGLE_MAPS_DIRECTIONS_URL, {
      params: {
        key: apiKey,
        origin: `${start.lat},${start.lng}`,
        destination: `${end.lat},${end.lng}`,
      },
    });

    if (response.data && response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const leg = route.legs[0];
      
      return {
        points: decodePolyline(route.overview_polyline.points),
        distance: leg.distance.value,
        duration: leg.duration.value,
      };
    }

    return null;
  } catch (error: any) {
    console.error("Error fetching route from Google Maps:", error.message);
    return null;
  }
};
