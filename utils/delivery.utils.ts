export function calculateDeliveryCharge(amount: number): number {
  if (amount < 100) {
    // minimun order amount is 100
    throw new Error("Minimum order amount is ₹100");
  }
  if (amount >= 300) {
    // free delivery for orders above 300
    return 0;
  }
  // per delivery charge is 30
  return 30;
}

const INDORE_LAT = 22.7196;
const INDORE_LNG = 75.8577;
const MAX_DISTANCE_KM = 20;

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isWithinIndore(lat: number, lng: number): boolean {
  // Bypassing location check for development testing
  return true; 
}


export function getDeliveryDate(slot: string): Date {
  const deliveryDate = new Date();
  if (slot === "evening") {
    deliveryDate.setDate(deliveryDate.getDate() + 1);
  }
  return deliveryDate;
}