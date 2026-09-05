import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/app.config.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { HTTPSTATUS } from "./config/http.config.js";
import { asyncHandler } from "./middlewares/asyncHandler.middleware.js";
import { mongoSanitize } from "./middlewares/mongoSanitize.middleware.js";
import { generalLimiter, authLimiter } from "./middlewares/rateLimiter.middleware.js";
import userAuthRoutes from "./routes/userAuth.routes.js";
import driverAuthRoutes from "./routes/driverAuth.routes.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import categoryRoutes from "./routes/categories.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import addressRoutes from "./routes/address.routes.js";
import orderRoutes from "./routes/order.routes.js";
import wishlistRoutes from "./routes/whishlist.routes.js";
import razorpayRoutes from "./routes/razorpay.routes.js";
import driverRoutes from "./routes/driver.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import restaurantRoutes from "./routes/restaurant.route.js";
import ledgerRoutes from "./routes/ledger.routes.js";
import refundRoutes from "./routes/refund.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import couponRoutes from "./routes/coupon.routes.js";
import popularDishRoutes from "./routes/popularDish.routes.js";
import groceryRoutes from "./routes/grocery.route.js";
import uploadRoutes from "./routes/upload.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import bannerRoutes from "./routes/banner.routes.js";
import issueRoutes from "./routes/issue.routes.js";
import zoneRoutes from "./routes/zone.routes.js";
import { razorpayWebhook } from "./controllers/razorpay.controller.js";

import { requireJsonContent } from "./middlewares/contentType.middleware.js";

const app = express();
app.set("trust proxy", 1);
const BASE_PATH = config.BASE_PATH; // Defaults to /api/v1

// Security Headers via Helmet
app.use(helmet());

// CORS - Explicit Whitelist configuration
const allowedOrigins = [
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
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      const isLocalhost = origin && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));
      if (!origin || allowedOrigins.includes(origin) || isLocalhost || process.env.NODE_ENV !== "production") {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);

// Backward compatibility alias: rewrite /api/... to /api/v1/...
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/") && !req.url.startsWith("/api/v1/")) {
    req.url = req.url.replace("/api/", "/api/v1/");
  }
  next();
});

// 🟢 Razorpay Webhook (MUST be before express.json() for raw body verification)
app.post(
  `${BASE_PATH}/razorpay/webhook`,
  express.raw({ type: "application/json" }),
  razorpayWebhook
);

import { v4 as uuidv4 } from "uuid";

// Add request ID
app.use((req, _res, next) => {
  (req as any).id = uuidv4();
  next();
});

// Body Parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Content-Type validation
app.use(requireJsonContent);

// NoSQL Injection Protection
app.use(mongoSanitize);

// General rate limit on all API routes
app.use(`${BASE_PATH}`, generalLimiter);

// Health Check
app.get(
  [`/`, `${BASE_PATH}/`],
  asyncHandler(async (_req, res) => {
    return res.status(HTTPSTATUS.OK).json({
      message: "ECD KART API is running",
      version: "1.0.0",
    });
  })
);

// Auth routes (with dedicated auth rate limiting)
app.use(`${BASE_PATH}/auth/user`, authLimiter, userAuthRoutes);
app.use(`${BASE_PATH}/auth/driver`, authLimiter, driverAuthRoutes);
app.use(`${BASE_PATH}/auth/admin`, authLimiter, authRoutes);

// Protected & Resource Routes
app.use(`${BASE_PATH}/user`, userRoutes);
app.use(`${BASE_PATH}/admin`, adminRoutes);
app.use(`${BASE_PATH}/categories`, categoryRoutes);
app.use(`${BASE_PATH}/cart`, cartRoutes);
app.use(`${BASE_PATH}/addresses`, addressRoutes);
app.use(`${BASE_PATH}/orders`, orderRoutes);
app.use(`${BASE_PATH}/wishlist`, wishlistRoutes);
app.use(`${BASE_PATH}/drivers`, driverRoutes);
app.use(`${BASE_PATH}/invoices`, invoiceRoutes);
app.use(`${BASE_PATH}/reviews`, reviewRoutes);
app.use(`${BASE_PATH}/restaurants`, restaurantRoutes);
app.use(`${BASE_PATH}/grocery`, groceryRoutes);
app.use(`${BASE_PATH}/ledger`, ledgerRoutes);
app.use(`${BASE_PATH}/refunds`, refundRoutes);
app.use(`${BASE_PATH}/notifications`, notificationRoutes);
app.use(`${BASE_PATH}/coupons`, couponRoutes);
app.use(`${BASE_PATH}/popular-dishes`, popularDishRoutes);

app.use(`${BASE_PATH}/upload`, uploadRoutes);
app.use(`${BASE_PATH}/settings`, settingsRoutes);
app.use(`${BASE_PATH}/banners`, bannerRoutes);
app.use(`${BASE_PATH}/issues`, issueRoutes);
app.use(`${BASE_PATH}/zones`, zoneRoutes);

app.use(`${BASE_PATH}/razorpay`, razorpayRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;

