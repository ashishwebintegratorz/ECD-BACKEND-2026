import "dotenv/config";
import express from "express";
import cors from "cors";
import { config } from "./config/app.config.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { HTTPSTATUS } from "./config/http.config.js";
import { asyncHandler } from "./middlewares/asyncHandler.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import productRoutes from "./routes/product.route.js";
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


const app = express();
const BASE_PATH = config.BASE_PATH;

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

// Health
app.get(
  `/`,
  asyncHandler(async (req, res) => {
    return res.status(HTTPSTATUS.OK).json({
      message: "Welcome to the backend API",
      version: "1.0.0",
    });
  })
);

// routes
app.use(`${BASE_PATH}/auth`, authRoutes);
app.use(`${BASE_PATH}/user`, userRoutes);
app.use(`${BASE_PATH}/admin`, adminRoutes);
app.use(`${BASE_PATH}/products`, productRoutes);
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

// app.use(`${BASE_PATH}/razorpay`, razorpayRoutes); // Moved up

// error handler (last)
app.use(errorHandler);

export default app;
