import { Server } from "socket.io";
import UserModel from "../models/User.model.js";
import RestaurantModel from "../models/Restaurant.model.js";
import { verifyAccessJwt } from "../utils/jwt.js";

let io: Server | null = null;
const driverSockets = new Map<string, string>(); // socket.id -> driverId
const restaurantSockets = new Map<string, string>(); // socket.id -> restaurantId

export function setIo(instance: Server) {
  io = instance;
}

/**
 * On server boot, clean up orphan online statuses left behind by crashed/abruptly closed test processes.
 */
export async function syncOrphanOnlineStatuses() {
  try {
    const offlineDrivers = await UserModel.updateMany(
      { role: "driver", isOnline: true },
      { isOnline: false }
    );
    const offlineRestaurants = await RestaurantModel.updateMany(
      { isOnline: true },
      { isOnline: false }
    );
    console.log(`[Status Sync] Reset orphan online statuses on startup: ${offlineDrivers.modifiedCount} drivers, ${offlineRestaurants.modifiedCount} restaurants set offline.`);
  } catch (err) {
    console.error("[Status Sync Error]:", err);
  }
}

export function initOrderSocket(instance: Server) {
  // Reset orphan statuses on socket server initialization
  syncOrphanOnlineStatuses();

  // Socket Handshake Authentication Middleware
  instance.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
      if (!token) {
        if (process.env.NODE_ENV === "development") {
          (socket as any).user = { role: "guest" };
          return next();
        }
        return next(new Error("Authentication error: Missing token"));
      }

      const payload: any = verifyAccessJwt(token);
      const user = await UserModel.findById(payload.sub);
      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }
      (socket as any).user = user;
      next();
    } catch (err: any) {
      if (process.env.NODE_ENV === "development") {
        (socket as any).user = { role: "guest" };
        return next();
      }
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  instance.on("connection", (socket) => {
    const user = (socket as any).user;
    console.log(`Socket connected: ${socket.id} (User: ${user?._id || "guest"}, Role: ${user?.role || "none"})`);

    socket.on("joinOrder", (orderId: string) => {
      console.log(`[Socket] Client ${socket.id} joining order room: order_${orderId}`);
      if (!orderId) return;
      socket.join(`order_${orderId}`);
    });

    socket.on("leaveOrder", (orderId: string) => {
      if (!orderId) return;
      socket.leave(`order_${orderId}`);
    });

    // Customer joins their personal room to receive order updates across all screens
    socket.on("joinCustomer", (customerId: string) => {
      const targetId = customerId || user?._id?.toString();
      if (!targetId) return;
      socket.join(`customer_${targetId}`);
      console.log(`[Socket] Client ${socket.id} joined customer room: customer_${targetId}`);
    });

    socket.on("leaveCustomer", (customerId: string) => {
      const targetId = customerId || user?._id?.toString();
      if (!targetId) return;
      socket.leave(`customer_${targetId}`);
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

    // Direct Socket Toggle for Driver Online Status
    socket.on("toggleDriverStatus", async (data: { isOnline: boolean }) => {
      const driverId = user?._id?.toString() || driverSockets.get(socket.id);
      if (!driverId) return;
      const isOnline = Boolean(data.isOnline);
      const updatedUser = await UserModel.findByIdAndUpdate(
        driverId,
        { isOnline, isReturning: false },
        { new: true }
      );
      emitDriverStatusUpdate(driverId, isOnline, { user: updatedUser });
      console.log(`[Socket] Driver ${driverId} status toggled via socket to ${isOnline ? "Online" : "Offline"}`);
    });

    // Direct Socket Toggle for Restaurant Online Status
    socket.on("toggleRestaurantStatus", async (data: { restaurantId: string; isOnline?: boolean; isActive?: boolean }) => {
      const restaurantId = data.restaurantId || restaurantSockets.get(socket.id);
      if (!restaurantId) return;
      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) return;
      if (data.isOnline !== undefined) restaurant.isOnline = data.isOnline;
      if (data.isActive !== undefined) restaurant.isActive = data.isActive;
      await restaurant.save();
      emitRestaurantStatusUpdate(restaurantId, restaurant.isOnline, restaurant.isActive, restaurant);
      console.log(`[Socket] Restaurant ${restaurantId} status toggled via socket: isOnline=${restaurant.isOnline}, isActive=${restaurant.isActive}`);
    });

    // Admin room (Requires admin role check)
    socket.on("joinAdmin", () => {
      if (user?.role === "admin" || process.env.NODE_ENV === "development") {
        socket.join("admins");
      }
    });

    socket.on("disconnect", async (reason) => {
      console.log("Socket disconnected:", socket.id, reason);
      
      const driverId = driverSockets.get(socket.id);
      if (driverId) {
        try {
          driverSockets.delete(socket.id);
          const hasOtherSockets = Array.from(driverSockets.values()).includes(driverId);
          if (!hasOtherSockets) {
            await UserModel.findByIdAndUpdate(driverId, { isOnline: false });
            emitDriverStatusUpdate(driverId, false);
            console.log(`[Socket] Driver ${driverId} marked offline and broadcasted on disconnect.`);
          }
        } catch (err) {
          console.error("Error setting driver offline on disconnect:", err);
        }
      }

      const restaurantId = restaurantSockets.get(socket.id);
      if (restaurantId) {
        try {
          restaurantSockets.delete(socket.id);
          const hasOtherSockets = Array.from(restaurantSockets.values()).includes(restaurantId);
          if (!hasOtherSockets) {
            await RestaurantModel.findByIdAndUpdate(restaurantId, { isOnline: false });
            emitRestaurantStatusUpdate(restaurantId, false);
            console.log(`[Socket] Restaurant ${restaurantId} marked offline and broadcasted on disconnect.`);
          }
        } catch (err) {
          console.error("Error setting restaurant offline on disconnect:", err);
        }
      }
    });
  });
}

// Real-time broadcast for Driver Online/Offline status changes
export function emitDriverStatusUpdate(driverId: string, isOnline: boolean, extraData?: any) {
  if (!io) return;
  const payload = { driverId, isOnline, timestamp: new Date().toISOString(), ...extraData };
  io.to("admins").emit("driverStatusChanged", payload);
  io.to(`driver_${driverId}`).emit("driverStatusChanged", payload);
  io.emit("driverStatusUpdated", payload);
}

// Real-time broadcast for Restaurant Online/Offline/Active status changes
export function emitRestaurantStatusUpdate(restaurantId: string, isOnline: boolean, isActive?: boolean, extraData?: any) {
  if (!io) return;
  const payload = { restaurantId, isOnline, isActive, timestamp: new Date().toISOString(), ...extraData };
  io.to("admins").emit("restaurantStatusChanged", payload);
  io.to(`restaurant_${restaurantId}`).emit("restaurantStatusChanged", payload);
  io.emit("restaurantStatusUpdated", payload);
}

// Notify customer + admin when order status changes
export function emitOrderStatusUpdate(orderId: string, payload: any, customerId?: string) {
  console.log(`[Socket] EMITTING orderStatusUpdated for order_${orderId} (Customer: ${customerId || 'unknown'}):`, payload);
  if (!io) {
    console.log("[Socket] Error: io is null!");
    return;
  }
  const data = { orderId, ...payload };
  io.to(`order_${orderId}`).emit("orderStatusUpdated", data);
  if (customerId) {
    io.to(`customer_${customerId}`).emit("orderStatusUpdated", data);
  }
  io.to("admins").emit("orderStatusChanged", data);
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

// Notify user when they are suspended by admin
export function emitAccountSuspended(userId: string, role: string) {
  if (!io) return;
  if (role === "driver") {
    io.to(`driver_${userId}`).emit("accountSuspended", { reason: "Admin is suspended you. You can connect to admin." });
  } else if (role === "restaurant") {
    io.to(`restaurant_${userId}`).emit("accountSuspended", { reason: "Admin is suspended you. You can connect to admin." });
  }
}

// Broadcast real-time notifications to all active admin clients
export function emitAdminNotification(notificationDoc: any) {
  if (!io) return;
  io.to("admins").emit("adminNotification", notificationDoc);
  // Also broadcast on general channel in case admin hasn't joined room yet
  io.emit("adminNotificationReceived", notificationDoc);
}

