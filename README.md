# 🛒 ECD KART — Backend API

A robust, scalable Node.js backend for **ECD KART** — a multi-store food & grocery delivery platform with real-time order tracking, payment processing, and driver management.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.1.0-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.20.0-brightgreen.svg)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8.1-black.svg)](https://socket.io/)

---

## ✨ Features

- 🔐 OTP-based authentication + Admin PIN login
- 🍽️ Restaurant & Grocery store support (single `storeType` field)
- 📦 Full order lifecycle with real-time socket updates
- 💳 Razorpay + COD payment integration with webhook
- 🚗 Driver management — assign, accept, decline, deliver with OTP
- 💰 Automatic ledger & payouts (weekly restaurant, monthly driver)
- 🔔 Firebase push notifications (configured)
- 📊 Admin panel — orders, drivers, stores, cancellations, ledger
- 📍 Single-city delivery (Indore, 20km radius)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES Modules) |
| Language | TypeScript 5.9.3 |
| Framework | Express.js 5.1.0 |
| Database | MongoDB + Mongoose 8.20.0 |
| Real-time | Socket.io 4.8.1 |
| Payment | Razorpay 2.9.6 |
| Notifications | Firebase Admin 13.8.0 |
| Validation | Zod 4.1.12 |
| Scheduling | node-cron 4.2.1 |
| Images | Cloudinary |

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Set up `.env`
```env
NODE_ENV=development
PORT=5000
BASE_PATH=/api/v1
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/ECD_db
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=90d
OTP_EXPIRES_MINUTES=5
FRONTEND_ORIGIN=http://localhost:3000
RAZORPAY_KEY_ID=your-key-id
RAZORPAY_KEY_SECRET=your-key-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
PLATFORM_REF_ID=000000000000000000000001
```

### 3. Start development server
```bash
npm run dev
```

Server runs at `http://localhost:5000`

---

## 📋 Business Rules

| Rule | Value |
|---|---|
| Minimum order | ₹100 |
| Delivery charge (₹100–₹299) | ₹30 |
| Delivery charge (₹300+) | FREE |
| Delivery area | Indore only (20km radius) |
| Platform commission | 10% of order value |
| OTP validity | 5 minutes |
| OTP max attempts | 5 |
| JWT access token | 30 minutes |
| JWT refresh token | 90 days |
| Restaurant payout | Every Monday 3 AM IST |
| Driver payout | 1st of month 3 AM IST |

---

## 📁 Project Structure

```
ecd-kart-backend/
├── config/          # App, DB, Firebase, Razorpay config
├── controllers/     # Request handlers (14 controllers)
├── middlewares/     # JWT auth, role, validation, error handler
├── models/          # Mongoose schemas (19 models)
├── routes/          # API route definitions (15 route files)
├── services/        # Business logic (auth, order, otp, payout cron)
├── socket/          # Socket.io real-time events
├── utils/           # Helpers (JWT, delivery, SMS, error classes)
├── validators/      # Zod validation schemas
├── app.ts           # Express app setup
└── server.ts        # Server entry point + cron registration
```

---

## 📚 API Documentation

See `ApiEndPointDetail.md` for complete endpoint reference.

**Base URL:** `http://localhost:5000/api/v1`

---

## 🔄 Order Lifecycle

```
Customer places order → stock validated → payment
→ status: "preparing" → store notified (socket + push)
→ store marks ready → admin assigns driver
→ driver accepts → picks up → delivers with OTP
→ ledger updated → payouts scheduled
```

---

## 👨‍💻 Author

**ECD KART Team**

---

<div align="center">
  <strong>Built with ❤️ for ECD KART</strong>
</div>
