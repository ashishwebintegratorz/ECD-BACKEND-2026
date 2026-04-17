import { Server } from "socket.io";

let io: Server | null = null;

export function setIo(instance: Server) {
  io = instance;
}

export function initOrderSocket(instance: Server) {
  instance.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Customer joins their order room
    socket.on("joinOrder", (orderId: string) => {
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
    });

    // Driver joins their room to receive assignment notifications
    socket.on("joinDriver", (driverId: string) => {
      if (!driverId) return;
      socket.join(`driver_${driverId}`);
    });

    // Admin room
    socket.on("joinAdmin", () => {
      socket.join("admins");
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", socket.id, reason);
    });
  });
}

// Notify customer + admin when order status changes
export function emitOrderStatusUpdate(orderId: string, payload: any) {
  if (!io) return;
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
