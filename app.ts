import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config/app.config.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { HTTPSTATUS } from "./config/http.config.js";
import { asyncHandler } from "./middlewares/asyncHandler.middleware.js";
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
import groceryRoutes from "./routes/grocery.route.js";

const app = express();
const BASE_PATH = config.BASE_PATH;

// ── Rate Limiters ─────────────────────────────────────────────────────────────

// Strict: OTP endpoints — max 5 requests per 15 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many OTP requests. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// General: all API routes — max 200 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { message: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// 🟢 Razorpay Webhook (MUST be before express.json() for raw body verification)
app.use(`${BASE_PATH}/razorpay`, razorpayRoutes);

// Body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(
  cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true,
  })
);

// General rate limit on all API routes
app.use(`${BASE_PATH}`, generalLimiter);

// Health
app.get(
  `/`,
  asyncHandler(async (_req, res) => {
    return res.status(HTTPSTATUS.OK).json({
      message: "ECD KART API is running",
      version: "1.0.0",
    });
  })
);

// routes
app.use(`${BASE_PATH}/auth`, otpLimiter, authRoutes);
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
app.use(`${BASE_PATH}/ledger`, ledgerRoutes);
app.use(`${BASE_PATH}/refunds`, refundRoutes);
app.use(`${BASE_PATH}/notifications`, notificationRoutes);
app.use(`${BASE_PATH}/coupons`, couponRoutes);
app.use(`${BASE_PATH}/grocery`, groceryRoutes);

// app.use(`${BASE_PATH}/razorpay`, razorpayRoutes); // Moved up

// error handler (last)
app.use(errorHandler);

export default app;
