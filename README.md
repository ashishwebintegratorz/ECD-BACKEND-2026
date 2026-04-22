# 🥬 ECD-BACKEND

A robust, scalable Node.js backend API for VegBox - a vegetable delivery platform with real-time order tracking capabilities.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.1.0-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.20.0-brightgreen.svg)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8.1-black.svg)](https://socket.io/)

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
- [API Documentation](#-api-documentation)
  - [Authentication Endpoints](#authentication-endpoints)
  - [User Endpoints](#user-endpoints)
  - [Review Endpoints](#review-endpoints)
  - [Driver Endpoints](#driver-endpoints)
  - [Admin Endpoints](#admin-endpoints)
  - [Invoice Endpoints](#invoice-endpoints)
- [Architecture](#-architecture)
- [Development](#-development)
- [Deployment](#-deployment)
- [License](#-license)

## ✨ Features

- 🔐 **Secure Authentication** - OTP-based phone authentication with JWT tokens
- 🔄 **Refresh Token Support** - Access token refresh with secure refresh tokens
- 👥 **Role-Based Access Control** - Customer, Driver, and Admin roles
- 🔄 **Real-time Updates** - WebSocket integration for live order tracking
- 📱 **RESTful API** - Clean, well-structured API endpoints
- 🛡️ **Security First** - Rate limiting, CORS, input validation with Zod
- 🎯 **Type Safety** - Full TypeScript implementation
- 🚀 **Scalable Architecture** - Modular design with separation of concerns
- ⚡ **Performance Optimized** - Async/await patterns with proper error handling
- 📦 **Order Validation** - Minimum order (₹100) and delivery charge logic
- 📍 **Geo-Location Validation** - Orders restricted to Indore location only
- ⭐ **Review & Feedback System** - App and delivery reviews with admin controls
- 💳 **Payment Integration** - Razorpay payment gateway with webhook support

## 🛠️ Tech Stack

### Core
- **Runtime**: Node.js (ES Modules)
- **Language**: TypeScript 5.9.3
- **Framework**: Express.js 5.1.0
- **Database**: MongoDB with Mongoose ODM

### Key Dependencies
- **Authentication**: JWT (jsonwebtoken), bcrypt
- **Validation**: Zod 4.1.12
- **Real-time**: Socket.io 4.8.1
- **Payment**: Razorpay
- **Security**: express-rate-limit, CORS
- **Utilities**: date-fns, uuid, dotenv

### Development Tools
- **Build Tool**: TypeScript Compiler (tsc)
- **Dev Server**: tsx with watch mode
- **Environment**: cross-env for cross-platform compatibility

## 📁 Project Structure

```
vegbox-backend/
├── config/                 # Configuration files
│   ├── app.config.ts      # Application configuration
│   ├── database.config.ts # MongoDB connection setup
│   ├── http.config.ts     # HTTP status codes
│   └── razorpay.config.ts # Razorpay configuration
├── controllers/           # Request handlers
│   ├── auth.controller.ts
│   ├── user.controller.ts
│   ├── driver.controller.ts
│   ├── orders.controller.ts
│   ├── invoice.controller.ts
│   ├── review.controller.ts     # ✅ NEW
│   ├── razorpay.controller.ts
│   └── adminOrder.controller.ts
├── middlewares/           # Express middlewares
│   ├── asyncHandler.middleware.ts
│   ├── errorHandler.middleware.ts
│   ├── jwtAuth.middleware.ts
│   ├── role.middleware.ts
│   └── validate.middleware.ts
├── models/                # Mongoose schemas
│   ├── User.model.ts
│   ├── Order.model.ts
│   ├── Product.model.ts
│   ├── Otp.model.ts
│   ├── Review.model.ts          # ✅ NEW
│   ├── RefreshToken.model.ts
│   ├── PaymentTransaction.model.ts
│   └── Invoice.model.ts
├── routes/                # API route definitions
│   ├── auth.routes.ts
│   ├── user.routes.ts
│   ├── driver.routes.ts
│   ├── admin.routes.ts
│   ├── invoice.routes.ts
│   ├── order.routes.ts
│   ├── review.routes.ts         # ✅ NEW
│   └── razorpay.routes.ts
├── services/              # Business logic layer
│   ├── auth.service.ts
│   ├── order.service.ts
│   └── otp.service.ts
├── socket/                # WebSocket handlers
│   └── orderSocket.ts
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions
│   ├── appError.ts
│   ├── delivery.utils.ts        # ✅ NEW
│   ├── get-env.ts
│   ├── jwt.ts
│   └── sms.provider.ts
├── validators/            # Zod validation schemas
│   └── auth.validator.ts
├── app.ts                 # Express app configuration
├── server.ts              # Server entry point
├── tsconfig.json          # TypeScript configuration
└── package.json           # Project dependencies
```

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **MongoDB** (v6 or higher) - Running locally or cloud instance (MongoDB Atlas)
- **Git** (for version control)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd vegbox-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory and add the following variables.

4. **Start the development server**
   ```bash
   npm run dev
   ```

   The server will start on `http://localhost:5000`

### Environment Variables

```env
# Server Configuration
NODE_ENV=development
PORT=5000
BASE_PATH=/api

# Database
MONGO_URI=mongodb://localhost:27017/vegbox

# JWT Secrets
JWT_ACCESS_SECRET=your-super-secret-access-key-change-this
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=90d

# OTP Configuration
OTP_EXPIRES_MINUTES=5

# Razorpay
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
RAZORPAY_WEBHOOK_SECRET=your-razorpay-webhook-secret

# Frontend
FRONTEND_ORIGIN=http://localhost:3000
```

> ⚠️ **Security Note**: Never commit your `.env` file to version control.

## 📚 API Documentation

Base URL: `http://localhost:5000/api/v1`

---

### 🔐 Authentication Endpoints

#### 1. Send OTP
- **Method:** `POST`
- **Path:** `/api/auth/send-otp`
- **Body:**
  ```json
  {
    "phone": "+919876543210",
    "role": "customer"
  }
  ```

#### 2. Verify OTP
- **Method:** `POST`
- **Path:** `/api/auth/verify-otp`
- **Body:**
  ```json
  {
    "phone": "+919876543210",
    "code": "123456",
    "role": "driver",
    "pin": "1234"
  }
  ```

#### 3. Login with PIN
- **Method:** `POST`
- **Path:** `/api/auth/login-with-pin`
- **Body:**
  ```json
  {
    "phone": "+919876543210",
    "pin": "1234"
  }
  ```

#### 4. Refresh Token
- **Method:** `POST`
- **Path:** `/api/auth/refresh-token`
- **Body:**
  ```json
  {
    "refreshToken": "your-refresh-token"
  }
  ```

---

### 👤 User Endpoints
Requires `Authorization: Bearer <token>`

#### 1. Get Profile
- **Method:** `GET`
- **Path:** `/api/user/me`

---

### 📦 Order Endpoints
Requires `Authorization: Bearer <token>`

#### 1. Create Order
- **Method:** `POST`
- **Path:** `/api/orders/create`
- **Body:**
  ```json
  {
    "addressId": "address_id_here",
    "paymentMethod": "cod"
  }
  ```
> [!NOTE]
> Minimum order amount is ₹100. Delivery charge ₹30 for orders ₹100-₹299. FREE delivery for orders ₹300 and above. Orders only allowed from Indore location.

#### 2. Get My Orders
- **Method:** `GET`
- **Path:** `/api/orders/my-orders`

#### 3. Get Order by ID
- **Method:** `GET`
- **Path:** `/api/orders/:orderId`

#### 4. Cancel Order
- **Method:** `PUT`
- **Path:** `/api/orders/cancel/:orderId`

#### 5. Verify Payment
- **Method:** `POST`
- **Path:** `/api/orders/verify-payment`

---

### ⭐ Review Endpoints
Requires `Authorization: Bearer <token>`

#### 1. Create Review
- **Method:** `POST`
- **Path:** `/api/reviews`
- **Body:**
  ```json
  {
    "type": "app",
    "rating": 5,
    "comment": "Great app!",
    "orderId": "order_id_here"
  }
  ```
> [!NOTE]
> `type` can be `"app"` or `"delivery"`. `orderId` is optional.

#### 2. Get My Reviews
- **Method:** `GET`
- **Path:** `/api/reviews/my`

#### 3. Delete My Review
- **Method:** `DELETE`
- **Path:** `/api/reviews/:reviewId`

#### 4. Get All Reviews (Admin Only)
- **Method:** `GET`
- **Path:** `/api/reviews/all`
- **Query Params:** `?type=app` or `?type=delivery` (optional)

#### 5. Hide Review — Shadow (Admin Only)
- **Method:** `PUT`
- **Path:** `/api/reviews/hide/:reviewId`

#### 6. Delete Review (Admin Only)
- **Method:** `DELETE`
- **Path:** `/api/reviews/admin/:reviewId`

---

### 🚚 Driver Endpoints
Requires `Authorization: Bearer <token>` and `role: "driver"`

#### 1. Get My Assigned Orders
- **Method:** `GET`
- **Path:** `/api/orders/driver/my-orders`

#### 2. Update Delivery Status
- **Method:** `PUT`
- **Path:** `/api/orders/driver/update-status/:orderId`
- **Body:** `{ "status": "delivered" }`
- **Allowed:** `out_for_delivery`, `delivered`, `failed`

#### 3. Toggle Online Status
- **Method:** `PUT`
- **Path:** `/api/drivers/toggle-online`
- **Body:** `{ "isOnline": true }`

#### 4. Signal Reached Store
- **Method:** `PUT`
- **Path:** `/api/drivers/reached-store`

---

### 📄 Invoice Endpoints
Requires `Authorization: Bearer <token>`

#### 1. Get My Invoices
- **Method:** `GET`
- **Path:** `/api/invoices/me`

#### 2. Get Invoice by Order ID
- **Method:** `GET`
- **Path:** `/api/invoices/order/:orderId`

#### 3. Get Invoice by ID
- **Method:** `GET`
- **Path:** `/api/invoices/:id`

#### 4. List All Invoices (Admin Only)
- **Method:** `GET`
- **Path:** `/api/invoices`
- **Query Params:** `?status=paid&from=2024-01-01&to=2024-01-31`

---

### 🛠️ Admin Endpoints
Requires `Authorization: Bearer <token>` and `role: "admin"`

#### 1. List All Orders
- **Method:** `GET`
- **Path:** `/api/orders/all`

#### 2. Get All Drivers
- **Method:** `GET`
- **Path:** `/api/drivers/all`

#### 3. Get Free Drivers
- **Method:** `GET`
- **Path:** `/api/drivers/free`

#### 4. Assign Driver to Order
- **Method:** `PUT`
- **Path:** `/api/orders/assign-driver/:orderId`
- **Body:** `{ "driverId": "user_id_here" }`

#### 5. Update Order Status
- **Method:** `PUT`
- **Path:** `/api/orders/update-status/:orderId`
- **Body:**
  ```json
  {
    "status": "ready",
    "deliveryStatus": "assigned"
  }
  ```

---

### 🔄 Order Status Reference

| Status Type | Allowed Values |
| :--- | :--- |
| **Order** | `pending`, `confirmed`, `preparing`, `ready`, `cancelled`, `failed` |
| **Delivery** | `pending`, `assigned`, `out_for_delivery`, `delivered`, `cancelled`, `failed` |

---

### 💰 Delivery Charge Reference

| Order Amount | Delivery Charge |
| :--- | :--- |
| Below ₹100 | ❌ Order not allowed |
| ₹100 - ₹299 | ₹30 |
| ₹300 and above | FREE ✅ |

---

### 🏁 Driver Workflow Guide

1. **Go Online:** Call `/api/drivers/toggle-online` with `isOnline: true`
2. **Accept Order:** Admin assigns order → `deliveryStatus` becomes `assigned`
3. **Out for Delivery:** Call `/api/orders/driver/update-status/:id` with `status: "out_for_delivery"`
4. **Deliver:** Call `/api/orders/driver/update-status/:id` with `status: "delivered"`
5. **Return to Store:** `isReturning` becomes `true` automatically
6. **Arrive at Base:** Call `/api/drivers/reached-store` → available again!

---

## 🏗️ Architecture

### Layered Architecture

```
┌─────────────────────────────────────┐
│         Routes Layer                │  ← API Endpoints
├─────────────────────────────────────┤
│      Middlewares Layer              │  ← Auth, Validation, Error Handling
├─────────────────────────────────────┤
│      Controllers Layer              │  ← Request/Response Handling
├─────────────────────────────────────┤
│       Services Layer                │  ← Business Logic
├─────────────────────────────────────┤
│        Models Layer                 │  ← Data Models & Database
└─────────────────────────────────────┘
```

## 💻 Development

### Available Scripts

```bash
# Development with auto-reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Adding New Features

1. **Create Model** in `models/`
2. **Define Validation Schema** in `validators/`
3. **Implement Service Logic** in `services/`
4. **Create Controller** in `controllers/`
5. **Define Routes** in `routes/`
6. **Register Routes** in `app.ts`

## 🚢 Deployment

```bash
npm run build
npm start
```

## 📄 License

This project is licensed under the WebIntegratorz License.

## 👨‍💻 Author

**[WebIntegratorz](https://webintegratorz.com/) Team**

---

<div align="center">
  <strong>Built with ❤️ for fresh vegetable delivery</strong>
</div>