import { Server } from "socket.io";

let io: Server | null = null;

export function setIo(instance: Server) {
  io = instance;
}

export function initOrderSocket(instance: Server) {
  instance.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("joinOrder", (orderId: string) => {
      if (!orderId) return;
      socket.join(`order_${orderId}`);
      console.log(`${socket.id} joined order_${orderId}`);
    });

    socket.on("leaveOrder", (orderId: string) => {
      if (!orderId) return;
      socket.leave(`order_${orderId}`);
      console.log(`${socket.id} left order_${orderId}`);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", socket.id, reason);
    });
  });
}

export function emitOrderStatusUpdate(orderId: string, payload: any) {
  if (!io) {
    console.warn("IO not initialized");
    return;
  }
  io.to(`order_${orderId}`).emit("orderStatusUpdated", { orderId, ...payload });
  io.to("admins").emit("orderStatusChanged", { orderId, ...payload });
}
