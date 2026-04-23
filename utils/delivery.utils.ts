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

export function isWithinIndore(lat: number, lng: number): boolean {
  const R = 6371; // earth radius km
  const dLat = (lat - INDORE_LAT) * Math.PI / 180;
  const dLng = (lng - INDORE_LNG) * Math.PI / 180;  // FIX: was using INDORE_LAT
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(INDORE_LAT * Math.PI / 180) *
    Math.cos(lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return distance <= MAX_DISTANCE_KM;
}


export function getDeliveryDate(slot: string): Date {
  const deliveryDate = new Date();
  if (slot === "evening") {
    deliveryDate.setDate(deliveryDate.getDate() + 1);
  }
  return deliveryDate;
}