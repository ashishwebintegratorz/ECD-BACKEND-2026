import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import app from "../app.js";
import http from "http";
import User from "../models/User.model.js";
import Restaurant from "../models/Restaurant.model.js";
import Category from "../models/Category.model.js";
import PopularDish from "../models/PopularDish.model.js";
import Coupon from "../models/Coupon.model.js";
import Banner from "../models/Banner.model.js";
import Issue from "../models/Issue.model.js";
import Order from "../models/Order.model.js";
import { signAccessJwt } from "../utils/jwt.js";
import fs from "fs";
import path from "path";

export interface ApiTestResult {
  module: string;
  endpoint: string;
  method: string;
  role: string;
  description: string;
  expectedStatus: number[];
  actualStatus: number;
  durationMs: number;
  status: "PASS" | "WARN" | "FAIL";
  notes: string;
  responsePreview?: string;
}

const results: ApiTestResult[] = [];

async function runAudit() {
  console.log("===============================================================================");
  console.log("🚀 STARTING EXHAUSTIVE API AUDIT FOR ALL ECD-BACKEND-2026 ENDPOINTS");
  console.log("===============================================================================");

  const mongoUri = process.env.MONGO_URI || "";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB successfully.");

  // Start test HTTP server on random open port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api/v1`;
  console.log(`Test server running at ${baseUrl}`);

  // 1. Prepare/Fetch test tokens
  console.log("\n🔑 Generating Test Tokens for Customer, Driver, Restaurant & Admin...");
  
  let adminUser = await User.findOne({ role: "admin" });
  if (!adminUser) {
    adminUser = await User.create({
      phone: "+919999999999",
      name: "Super Admin",
      role: "admin",
      isPhoneVerified: true
    });
  }

  let customerUser = await User.findOne({ role: "customer" });
  if (!customerUser) {
    customerUser = await User.create({
      phone: "+919876543210",
      name: "Test Customer",
      role: "customer",
      isPhoneVerified: true
    });
  }

  let driverUser = await User.findOne({ role: "driver" });
  if (!driverUser) {
    driverUser = await User.create({
      phone: "+919876543211",
      name: "Test Driver",
      role: "driver",
      isOnline: true,
      isPhoneVerified: true
    });
  }

  let testRestaurant = await Restaurant.findOne();
  if (!testRestaurant) {
    testRestaurant = await Restaurant.create({
      name: "Audit Test Kitchen",
      slug: "audit-test-kitchen",
      restaurantId: "12345678901234",
      address: "Palasia, Indore",
      phone: "+919876543299",
      isActive: true,
      menu: [
        {
          name: "Butter Chicken",
          price: 320,
          b2bPrice: 220,
          foodType: "non-veg",
          isAvailable: true,
          approvalStatus: "approved"
        }
      ]
    });
  }

  const adminToken = signAccessJwt({ sub: adminUser._id.toString(), role: "admin" });
  const customerToken = signAccessJwt({ sub: customerUser._id.toString(), role: "customer" });
  const driverToken = signAccessJwt({ sub: driverUser._id.toString(), role: "driver" });
  const restaurantToken = signAccessJwt({ sub: testRestaurant._id.toString(), role: "restaurant" });

  console.log("✓ Tokens Generated Successfully.");

  // Helper function to execute request
  async function testEndpoint(
    module: string,
    endpointPath: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    role: "Public" | "Customer" | "Driver" | "Restaurant" | "Admin",
    description: string,
    expectedStatus: number[],
    body?: any
  ) {
    const token =
      role === "Admin" ? adminToken :
      role === "Customer" ? customerToken :
      role === "Driver" ? driverToken :
      role === "Restaurant" ? restaurantToken : "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const url = endpointPath.startsWith("http") ? endpointPath : `${baseUrl}${endpointPath}`;
    const start = Date.now();
    let actualStatus = 0;
    let responseText = "";
    let durationMs = 0;

    try {
      const fetchOpts: RequestInit = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      };

      const res = await fetch(url, fetchOpts);
      actualStatus = res.status;
      durationMs = Date.now() - start;
      responseText = await res.text();
    } catch (err: any) {
      actualStatus = 500;
      responseText = err.message;
      durationMs = Date.now() - start;
    }

    const isPass = expectedStatus.includes(actualStatus);
    const status: "PASS" | "WARN" | "FAIL" = isPass ? "PASS" : (actualStatus === 404 || actualStatus === 400 ? "WARN" : "FAIL");

    let preview = "";
    try {
      const json = JSON.parse(responseText);
      preview = JSON.stringify(json).substring(0, 100);
    } catch {
      preview = responseText.substring(0, 100);
    }

    results.push({
      module,
      endpoint: endpointPath,
      method,
      role,
      description,
      expectedStatus,
      actualStatus,
      durationMs,
      status,
      notes: isPass ? "Working as expected" : `Returned ${actualStatus} (Expected ${expectedStatus.join(",")})`,
      responsePreview: preview
    });

    console.log(`[${status.padEnd(4)}] ${method.padEnd(6)} ${endpointPath.padEnd(54)} -> ${actualStatus} (${durationMs}ms)`);
  }

  console.log("\n===============================================================================");
  console.log("🧪 TESTING ALL 25 BACKEND ROUTE MODULES...");
  console.log("===============================================================================");

  // 1. System Health
  await testEndpoint("System", "/", "GET", "Public", "Root API Gateway Health Check", [200]);

  // 2. Auth: Customer
  await testEndpoint("Auth Customer", "/auth/user/send-otp", "POST", "Public", "Customer Login OTP Request", [200], { phone: "9876543210" });
  await testEndpoint("Auth Customer", "/auth/user/verify-otp", "POST", "Public", "Customer OTP Verification & JWT Issue", [200, 400], { phone: "9876543210", otp: "4829" });
  await testEndpoint("Auth Customer", "/user/me", "GET", "Customer", "Get Authenticated Customer Profile", [200]);

  // 3. Auth: Driver
  await testEndpoint("Auth Driver", "/auth/driver/send-otp", "POST", "Public", "Rider Login OTP Request", [200], { phone: "9876543211" });
  await testEndpoint("Auth Driver", "/auth/driver/verify-otp", "POST", "Public", "Rider OTP Verification & JWT Issue", [200, 400], { phone: "9876543211", otp: "4829" });

  // 4. Auth: Admin
  await testEndpoint("Auth Admin", "/auth/admin/send-otp", "POST", "Public", "Admin Send OTP", [200], { phone: "9999999999" });
  await testEndpoint("Auth Admin", "/auth/admin/login-with-pin", "POST", "Public", "Admin Login with PIN", [200, 400], { phone: "9999999999", pin: "1234" });

  // 5. User Profile
  await testEndpoint("User", "/user/me", "GET", "Customer", "Customer Detailed Account Profile", [200]);
  await testEndpoint("User", "/user/update-profile", "PUT", "Customer", "Update Customer Profile", [200], { name: "Test Customer" });

  // 6. Food Categories ("What's on your mind?")
  await testEndpoint("Categories", "/categories", "GET", "Public", "Get Active Food Categories List", [200]);
  await testEndpoint("Categories", "/categories/biryani", "GET", "Public", "Get Category Details by Slug", [200, 404]);

  // 7. Popular Dishes
  await testEndpoint("Popular Dishes", "/popular-dishes", "GET", "Public", "Get Homepage Popular Dishes Carousel", [200]);

  // 8. Restaurants & Vendors
  await testEndpoint("Restaurants", "/restaurants/list", "GET", "Public", "List Nearby Restaurants (Geospatial)", [200]);
  await testEndpoint("Restaurants", "/restaurants/search?query=pizza", "GET", "Public", "Restaurant & Food Search", [200]);
  await testEndpoint("Restaurants", "/restaurants/suggestions?query=biry", "GET", "Public", "Live Search Suggestions", [200]);
  await testEndpoint("Restaurants", "/restaurants/by-category/biryani", "GET", "Public", "Filter Restaurants by Category", [200]);
  await testEndpoint("Restaurants", `/restaurants/menu/${testRestaurant.slug}`, "GET", "Public", "Public Restaurant Menu with Public Prices", [200]);
  await testEndpoint("Restaurants", `/restaurants/slug/${testRestaurant.slug}`, "GET", "Public", "Get Restaurant Info by Slug", [200]);
  await testEndpoint("Restaurants", `/restaurants/${testRestaurant.restaurantId}/profile`, "GET", "Restaurant", "Restaurant Vendor Portal Profile & Menu", [200]);
  await testEndpoint("Restaurants", `/restaurants/${testRestaurant.restaurantId}/dashboard-stats?filter=today`, "GET", "Restaurant", "Vendor Live Sales & Revenue Stats", [200]);
  await testEndpoint("Restaurants", `/restaurants/${testRestaurant.restaurantId}/order-history`, "GET", "Restaurant", "Vendor Completed Order History", [200]);

  // 9. Menu Management & Approvals
  await testEndpoint("Menu Management", `/restaurants/vendor/menu/add/${testRestaurant.restaurantId}`, "POST", "Restaurant", "Vendor Submit New Menu Item for Admin Approval", [201], {
    name: "Audit Test Dish",
    description: "Item for automated audit test",
    b2bPrice: 160,
    price: 160,
    foodType: "veg"
  });
  await testEndpoint("Menu Approvals", "/restaurants/admin/menu/pending", "GET", "Admin", "Admin Pending Menu Approvals", [200]);
  await testEndpoint("Menu Approvals", "/restaurants/admin/menu/history", "GET", "Admin", "Admin Approval History Log", [200]);

  // 10. Cart Management
  await testEndpoint("Cart", "/cart", "GET", "Customer", "Get Customer Active Cart", [200]);
  await testEndpoint("Cart", "/cart/clear", "DELETE", "Customer", "Clear All Cart Items", [200]);

  // 11. Delivery Addresses
  await testEndpoint("Address", "/addresses/me", "GET", "Customer", "List Saved Customer Addresses", [200]);

  // 12. Orders Management
  await testEndpoint("Orders", "/orders/my-orders", "GET", "Customer", "Customer My Orders List", [200]);
  await testEndpoint("Orders", `/orders/restaurant/${testRestaurant._id}`, "GET", "Restaurant", "Restaurant Active Orders Feed", [200]);
  await testEndpoint("Orders", "/orders/admin/all", "GET", "Admin", "Admin Master Orders Oversight", [200]);
  await testEndpoint("Orders", "/orders/admin/cancellations", "GET", "Admin", "Admin Cancellation Audit Trail", [200]);

  // 13. Delivery Drivers / Riders
  await testEndpoint("Drivers", "/drivers/admin/all", "GET", "Admin", "Admin All Registered Riders", [200]);
  await testEndpoint("Drivers", "/drivers/admin/live-status", "GET", "Admin", "Admin Active Online Riders Live Map", [200]);
  await testEndpoint("Drivers", "/drivers/wallet", "GET", "Driver", "Rider Wallet Balance & Daily Hours", [200]);
  await testEndpoint("Drivers", "/drivers/toggle-status", "PATCH", "Driver", "Rider Online/Offline Status Toggle", [200], { isOnline: true });
  await testEndpoint("Drivers", "/drivers/admin/withdrawals", "GET", "Admin", "Admin Rider Payout Requests", [200]);
  await testEndpoint("Drivers", "/drivers/admin/cod-settlements", "GET", "Admin", "Admin Rider Cash-on-Delivery Balances", [200]);

  // 14. Support Issues & Tickets
  await testEndpoint("Issues", "/issues", "GET", "Admin", "Admin Customer Support Tickets", [200]);

  // 15. Reviews & Ratings
  await testEndpoint("Reviews", "/reviews/all", "GET", "Admin", "Admin Master Customer Reviews", [200]);
  await testEndpoint("Reviews", "/reviews/my", "GET", "Customer", "Customer Personal Reviews History", [200]);

  // 16. Real-Time Admin Notifications
  await testEndpoint("Notifications", "/notifications/admin", "GET", "Admin", "Admin Real-Time Notification Stream", [200]);
  await testEndpoint("Notifications", "/notifications/my", "GET", "Customer", "Customer Notification Stream", [200]);
  await testEndpoint("Notifications", "/notifications/unread-count", "GET", "Customer", "Customer Unread Notification Count", [200]);
  await testEndpoint("Notifications", "/notifications/admin/history", "GET", "Admin", "Push Broadcast Notification History", [200]);

  // 17. Coupons & Discounts
  await testEndpoint("Coupons", "/coupons/active", "GET", "Customer", "Active Available Discount Coupons", [200]);
  await testEndpoint("Coupons", "/coupons/admin/all", "GET", "Admin", "Admin Coupon Code Directory", [200]);

  // 18. Advertisement Banners
  await testEndpoint("Banners", "/banners", "GET", "Public", "Customer App Homepage Banners", [200]);
  await testEndpoint("Banners", "/banners/admin", "GET", "Admin", "Admin Banner Management List", [200]);

  // 19. Wishlist
  await testEndpoint("Wishlist", "/wishlist", "GET", "Customer", "Customer Saved Favorite Dishes", [200]);

  // 20. Invoices
  await testEndpoint("Invoices", "/invoices", "GET", "Admin", "Admin All Invoices List", [200]);
  await testEndpoint("Invoices", "/invoices/me", "GET", "Customer", "Customer Personal Invoices", [200]);

  // 21. Accounting & Ledger
  await testEndpoint("Ledger", "/ledger", "GET", "Admin", "Platform Financial Ledger Entries", [200]);
  await testEndpoint("Ledger", "/ledger/summary", "GET", "Admin", "Platform Financial Breakdown Summary", [200]);
  await testEndpoint("Ledger", "/ledger/batches", "GET", "Admin", "Completed Settlement Payout Batches", [200]);

  // 22. Customer Refunds
  await testEndpoint("Refunds", "/refunds/all", "GET", "Admin", "Customer Razorpay & COD Refund Records", [200]);
  await testEndpoint("Refunds", "/refunds/stats", "GET", "Admin", "Refund Statistics & Status Breakdown", [200]);
  await testEndpoint("Refunds", "/refunds/my", "GET", "Customer", "Customer Personal Refund Status", [200]);

  // 23. Grocery Store Catalog
  await testEndpoint("Grocery", "/grocery/list", "GET", "Public", "Grocery Stores Catalog List", [200]);

  // 24. Settings
  await testEndpoint("Settings", "/settings", "GET", "Public", "Global Platform Delivery Settings", [200]);

  // 25. Admin User Management & Stats
  await testEndpoint("Admin", "/admin/dashboard", "GET", "Admin", "Admin Master KPI Dashboard Stats", [200]);
  await testEndpoint("Admin", "/admin/live-orders", "GET", "Admin", "Admin Real-Time Active Orders Monitor", [200]);
  await testEndpoint("Admin", "/admin/users", "GET", "Admin", "Admin User Account Directory", [200]);
  await testEndpoint("Admin", "/admin/suspended-accounts", "GET", "Admin", "Admin Moderated / Suspended Accounts", [200]);
  await testEndpoint("Admin", "/admin/stats/revenue", "GET", "Admin", "Admin Revenue Analytics & Trends", [200]);
  await testEndpoint("Admin", "/admin/stats/stores", "GET", "Admin", "Admin Partner Stores Performance", [200]);
  await testEndpoint("Admin", "/admin/withdrawals", "GET", "Admin", "Admin Rider Withdrawal Queue", [200]);
  await testEndpoint("Admin", "/admin/riders/orders/summary", "GET", "Admin", "Admin Rider Orders Performance", [200]);
  await testEndpoint("Admin", "/admin/riders/cod-summary", "GET", "Admin", "Admin Rider COD Balances", [200]);

  console.log("\n===============================================================================");
  console.log("🏁 AUDIT EXECUTION COMPLETE");
  console.log("===============================================================================");

  const totalTests = results.length;
  const passedTests = results.filter(r => r.status === "PASS").length;
  const warnedTests = results.filter(r => r.status === "WARN").length;
  const failedTests = results.filter(r => r.status === "FAIL").length;
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);

  console.log(`\n================ SUMMARY ================`);
  console.log(`Total APIs Tested: ${totalTests}`);
  console.log(`Passed:            ${passedTests} (${passRate}%)`);
  console.log(`Warnings / Inactive: ${warnedTests}`);
  console.log(`Failed:            ${failedTests}`);
  console.log(`=========================================\n`);

  // Save audit results to JSON
  const outputPath = path.join(process.cwd(), "audit_results.json");
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { totalTests, passedTests, warnedTests, failedTests, passRate },
    results
  }, null, 2));

  console.log(`Audit results JSON written to: ${outputPath}`);

  await server.close();
  await mongoose.disconnect();
}

runAudit().catch(err => {
  console.error("Audit script failed:", err);
  process.exit(1);
});
