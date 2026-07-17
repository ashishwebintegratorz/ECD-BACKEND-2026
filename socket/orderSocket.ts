import { Server } from "socket.io";
import UserModel from "../models/User.model.js";
import RestaurantModel from "../models/Restaurant.model.js";

let io: Server | null = null;
const driverSockets = new Map<string, string>(); // socket.id -> driverId
const restaurantSockets = new Map<string, string>(); // socket.id -> restaurantId

export function setIo(instance: Server) {
  io = instance;
}

export function initOrderSocket(instance: Server) {
  instance.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("joinOrder", (orderId: string) => {
      console.log(`[Socket] Client ${socket.id} joining order room: order_${orderId}`);
      if (!orderId) return;
      socket.join(`order_${orderId}`);
    });

    socket.on("leaveOrder", (orderId: string) => {
      if (!orderId) return;
      socket.leave(`order_${orderId}`);
    });

    // Restaurant joins their room to receive new order notifications
    socket.on("joinRestaurant", (restaurantId: string) => {
      if (!restaurantId) return;
      socket.join(`restaurant_${restaurantId}`);
      restaurantSockets.set(socket.id, restaurantId);
    });

    // Driver joins their room to receive assignment notifications
    socket.on("joinDriver", async (driverId: string) => {
      if (!driverId) return;
      socket.join(`driver_${driverId}`);
      driverSockets.set(socket.id, driverId);
    });

    // Admin room
    socket.on("joinAdmin", () => {
      socket.join("admins");
    });

    socket.on("disconnect", async (reason) => {
      console.log("Socket disconnected:", socket.id, reason);
      
      const driverId = driverSockets.get(socket.id);
      if (driverId) {
        try {
          driverSockets.delete(socket.id);
          await UserModel.findByIdAndUpdate(driverId, { isOnline: false });
          console.log(`[Socket] Driver ${driverId} marked offline due to disconnect.`);
        } catch (err) {
          console.error("Error setting driver offline on disconnect:", err);
        }
      }

      const restaurantId = restaurantSockets.get(socket.id);
      if (restaurantId) {
        try {
          restaurantSockets.delete(socket.id);
          await RestaurantModel.findByIdAndUpdate(restaurantId, { isOnline: false });
          console.log(`[Socket] Restaurant ${restaurantId} marked offline due to disconnect.`);
        } catch (err) {
          console.error("Error setting restaurant offline on disconnect:", err);
        }
      }
    });
  });
}

// Notify customer + admin when order status changes
export function emitOrderStatusUpdate(orderId: string, payload: any) {
  console.log(`[Socket] EMITTING orderStatusUpdated for order_${orderId}:`, payload);
  if (!io) {
    console.log("[Socket] Error: io is null!");
    return;
  }
  io.to(`order_${orderId}`).emit("orderStatusUpdated", { orderId, ...payload });
  io.to("admins").emit("orderStatusChanged", { orderId, ...payload });
}

// Notify restaurant when a new order arrives
export function emitNewOrderToRestaurant(restaurantId: string, payload: any) {
  if (!io) return;
  io.to(`restaurant_${restaurantId}`).emit("newOrder", payload);
}

// Notify driver when assigned to an order
export function emitOrderAssignedToDriver(driverId: string, payload: any) {
  if (!io) return;
  io.to(`driver_${driverId}`).emit("orderAssigned", payload);
}

// Emit driver GPS location to admin room in real-time
export function emitDriverLocation(driverId: string, payload: any) {
  if (!io) return;
  io.to("admins").emit("driverLocationUpdated", { driverId, ...payload });
}
