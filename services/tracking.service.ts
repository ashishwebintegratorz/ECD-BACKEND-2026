import axios from "axios";

const ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions/driving-car";

export interface IRoutePoint {
  lng: number;
  lat: number;
}

export interface IRouteData {
  points: [number, number][]; // [[lng, lat], ...]
  distance: number; // in meters
  duration: number; // in seconds
}

export const getRouteFromORS = async (
  start: IRoutePoint,
  end: IRoutePoint
): Promise<IRouteData | null> => {
  try {
    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
      console.error("ORS_API_KEY is not set in .env");
      return null;
    }

    const response = await axios.get(ORS_BASE_URL, {
      params: {
        api_key: apiKey,
        start: `${start.lng},${start.lat}`,
        end: `${end.lng},${end.lat}`,
      },
    });

    if (response.data && response.data.features && response.data.features.length > 0) {
      const feature = response.data.features[0];
      return {
        points: feature.geometry.coordinates,
        distance: feature.properties.summary.distance,
        duration: feature.properties.summary.duration,
      };
    }

    return null;
  } catch (error: any) {
    console.error("Error fetching route from ORS:", error.message);
    return null;
  }
};
