import http from "http";
import { Server as IOServer } from "socket.io";
import app from "./app.js";
import { config } from "./config/app.config.js";
import connectDatabase from "./config/database.config.js";
import { initOrderSocket, setIo } from "./socket/orderSocket.js";
import { registerPayoutCrons } from "./services/payout.cron.js";
import { registerOrderCrons } from "./services/order.cron.js";
import { registerNotificationWorker } from "./services/notification.worker.js";

const PORT = Number(config.PORT) || 5000;

async function start() {
  await connectDatabase();

  const server = http.createServer(app);

  const io = new IOServer(server, {
    cors: {
      origin: [
        config.FRONTEND_ORIGIN,
        "https://ecd-admin.onrender.com",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:19006",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
      ].filter(Boolean) as string[],
      credentials: true,
    }
  });

  setIo(io);
  initOrderSocket(io);
  registerPayoutCrons(); // weekly restaurant + monthly driver payouts
  registerOrderCrons();
  registerNotificationWorker();

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT} in ${config.NODE_ENV} mode`);
  });

  // graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    io.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});




