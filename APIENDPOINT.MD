# ECD KART — API Endpoint Details

*Base URL:* http://localhost:5000/api/v1

> OTP is printed in the server terminal (SMS provider in test mode).
> PIN login is *admin only*.
> Rate limit: 5 OTP requests / 15 min · 200 general requests / min per IP.

---

## 🔐 AUTH — /api/v1/auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/send-otp | ❌ | Send OTP to phone |
| POST | /auth/verify-otp | ❌ | Verify OTP — register/login |
| POST | /auth/login-with-pin |  | Admin login with phone + PIN |
| POST | /auth/refresh-token | ❌ | Refresh access token |
| POST | /auth/refresh | ❌ | Refresh access token (cookie) |

*Customer:*
json
{ "phone": "9876543210", "code": "123456", "role": "customer", "name": "Faisal" }

*Admin (PIN required):*
json
{ "phone": "9999999999", "code": "123456", "role": "admin", "name": "Admin", "pin": "1234" }

*Admin login:*
json
{ "phone": "9999999999", "pin": "1234" }


---

## 👤 USER — /api/v1/user

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /user/me | ✅ | Get profile |
| PUT | /user/update-profile | ✅ | Update name |

---

## 🏠 ADDRESSES — /api/v1/addresses

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /addresses/add | ✅ | Add address |
| GET | /addresses/me | ✅ | My addresses |
| GET | /addresses/customer/:userId | ✅ | Driver: get customer address |
| PUT | /addresses/update/:id | ✅ | Update address |
| DELETE | /addresses/delete/:id | ✅ | Delete address |
| PATCH | /addresses/set-default/:id | ✅ | Set default |

json
{ "label": "Home", "fullAddress": "123 MG Road, Indore", "latitude": 22.7196, "longitude": 75.8577, "phone": "9876543210" }


---

## 🍽️ RESTAURANTS — /api/v1/restaurants


### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | http://localhost:5000/api/v1/restaurants/list | List restaurants (ranked) |
| GET | http://localhost:5000/api/v1/restaurants/search | Full search (Name, Category, Item) |
| GET | http://localhost:5000/api/v1/restaurants/suggestions | Auto-suggestions (Partial input) |
| GET | http://localhost:5000/api/v1/restaurants/details/:slug | Restaurant details + menu |
| GET | http://localhost:5000/api/v1/restaurants/menu/:slug | Menu items |


?page=1&limit=10&search=pizza&lat=22.7196&lng=75.8577
?query=biryani (for search & suggestions)
?foodType=veg|non-veg|vegan


### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /restaurants/admin/create | Create restaurant |
| PUT | /restaurants/admin/update/:id | Update restaurant |
| PATCH | /restaurants/admin/set-rating/:id | Set rating (0–5) |
| DELETE | /restaurants/admin/delete/:id | Delete restaurant |
| POST | /restaurants/admin/menu/add/:id | Add menu item |
| PUT | /restaurants/admin/menu/update/:id/:itemId | Update menu item |
| DELETE | /restaurants/admin/menu/delete/:id/:itemId | Delete menu item |

json
{ "name": "Spice Garden", "storeType": "restaurant", "address": "MG Road, Indore", "lat": 22.7196, "lng": 75.8577 }


---

## 🛒 GROCERY — /api/v1/grocery

> All grocery store management AND product management in one place.

### Public — Store

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /grocery/list | List grocery stores (ranked) |
| GET | /grocery/details/:slug | Store details |


?page=1&limit=10&search=fresh&lat=22.7196&lng=75.8577


### Public — Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /grocery/products/:storeId | Products for a store |
| GET | /grocery/product/:productId | Single product by ID |
| GET | /grocery/categories/:storeId | Categories with products in this store |


/grocery/products/:storeId?category=dairy&search=milk&page=1&limit=20&sort=priceAsc&minPrice=10&maxPrice=200


### Admin — Store Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /grocery/admin/create | Create grocery store |
| PUT | /grocery/admin/update/:id | Update store |
| PATCH | /grocery/admin/set-rating/:id | Set rating (0–5) |
| DELETE | /grocery/admin/delete/:id | Delete store |

json
{ "name": "Fresh Mart", "address": "Vijay Nagar, Indore", "lat": 22.7534, "lng": 75.8937 }


### Admin — Product Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /grocery/admin/product/add | Add product (multipart/form-data) |
| PUT | /grocery/admin/product/update/:productId | Update product (multipart/form-data) |
| PATCH | /grocery/admin/product/toggle/:productId | Activate / deactivate |
| DELETE | /grocery/admin/product/delete/:productId | Delete product |

*Add product (multipart/form-data):*

name:           "Organic Tomatoes"
description:    "Fresh farm tomatoes"
category:       "category_id"
storeId:        "grocery_store_id"
tags:           ["organic", "fresh"]
variants:       [{ "unit": "1kg", "price": 45, "mrp": 55, "stock": 200, "expiryDate": "2026-06-01" }]
variantImages_0: (file upload)


### Admin — Inventory Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /grocery/admin/expiring-products?days=3 | Products expiring soon |
| GET | /grocery/admin/low-stock?threshold=10 | Products below stock threshold |

---

## 🗂️ CATEGORIES — /api/v1/categories

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /categories | ❌ | All categories |
| GET | /categories/:id | ❌ | By ID |
| POST | /categories | ✅ admin | Create (multipart/form-data) |
| PUT | /categories/:id | ✅ admin | Update (multipart/form-data) |
| DELETE | /categories/:id | ✅ admin | Delete |

*Create/Update (multipart/form-data):*
- name: Category name
- parent: (Optional) Parent category ID
- ordering: (Optional) Display order
- image: (Optional) Category image file

---

### POPULAR DISHES
Manage trending/featured dishes for the home page carousel.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /popular-dishes | ❌ | All popular dishes |
| POST | /popular-dishes | ✅ admin | Create (multipart/form-data) |
| PUT | /popular-dishes/:id | ✅ admin | Update (multipart/form-data) |
| DELETE | /popular-dishes/:id | ✅ admin | Delete |

*Response Format (GET):*
json
{
  "success": true,
  "dishes": [
    { "name": "Biryani", "slug": "biryani", "image": "url...", "category": "Main Course", "ordering": 1 }
  ]
}


---

## 🛒 CART — /api/v1/cart

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /cart | ✅ | Get cart |
| POST | /cart/add | ✅ | Add item |
| PUT | /cart/update | ✅ | Update qty |
| DELETE | /cart/remove | ✅ | Remove item |
| DELETE | /cart/clear | ✅ | Clear cart |

---

## 🎟️ COUPONS — /api/v1/coupons

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | /coupons/validate | ✅ | any | Validate coupon before checkout |
| GET | /coupons/active | ✅ | any | List active coupons |
| GET | /coupons/all | ✅ | admin | All coupons with usage stats |
| POST | /coupons | ✅ | admin | Create coupon |
| PUT | /coupons/:id | ✅ | admin | Update coupon |
| DELETE | /coupons/:id | ✅ | admin | Delete coupon |

*Validate:*
json
{ "code": "SAVE50", "storeId": "store_id", "orderAmount": 300 }

*Create:*
json
{ 
  "code": "SAVE50", 
  "heading": "50% OFF",
  "subHeading": "50% OFF on your first order",
  "description": "Get flat 50% off up to ₹100 on your first order",
  "discountType": "percent", 
  "discountValue": 50, 
  "minOrderValue": 200, 
  "maxDiscountValue": 100, 
  "usageLimit": 100, 
  "validTo": "2026-12-31" 
}

Note: Admin endpoints moved to /api/v1/coupons/admin/create, /admin/update/:id, etc.

---

## 📋 ORDERS — /api/v1/orders

### Customer

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /orders/create | Create order (validates stock + coupon) |
| POST | /orders/verify-payment | Verify Razorpay payment |
| GET | /orders/my-orders | My orders (Grouped: active, past, cancelled) |
| GET | /orders/tracking/:orderId | Real-time tracking + Live Rider Map (ORS) |
| PUT | /orders/cancel/:orderId | Cancel order |
| GET | /orders/delivery-otp/:orderId | Get/regenerate delivery OTP |
| GET | /orders/:orderId | Order by ID |

*My Orders Response:*
json
{
  "success": true,
  "active": [...], 
  "past": [...],
  "cancelled": [...]
}


*Order Tracking Response:*
json
{
  "success": true,
  "order": { "_id": "...", "orderNumber": "...", "status": "preparing", ... },
  "currentStep": 1,
  "timeline": [
    { "status": "Order Placed", "completed": true, "time": "2026-05-14T10:00:00Z" },
    { "status": "Preparing", "completed": true, "time": "2026-05-14T10:05:00Z" },
    { "status": "On the Way", "completed": false, "time": null },
    { "status": "Delivered", "completed": false, "time": null }
  ],
  "canCancel": true,
  "remainingCancellationTime": 3.5
}

> currentStep: 0=Placed, 1=Preparing, 2=On the Way, 3=Delivered.
> canCancel: True only within 5 minutes of placing order.

*Create order:*
json
{ "addressId": "...", "restaurantId": "...", "paymentMethod": "cod", "couponCode": "SAVE50" }


*Calculation Logic:*
1. *Subtotal*: Sum of all items (price at time of adding to cart).
2. *Discount*: Applied coupon amount (percent or flat, capped by maxDiscountValue).
3. *Taxable Amount*: Math.max(0, Subtotal - Discount).
4. *GST*: 5% of the Taxable Amount (Food Delivery standard).
5. *Payable Amount*: Taxable Amount + Delivery Charge + GST.

*Response:*
json
{
  "orderId": "...",
  "razorpayOrderId": "...",
  "amount": 295,
  "deliveryCharge": 30,
  "gst": 15,
  "currency": "INR"
}


### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /orders/all | All orders |
| PUT | /orders/update-status/:orderId | Update status |
| PUT | /orders/assign-driver/:orderId | Assign driver |

### Store (Restaurant / Grocery)

| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | /orders/restaurant/ready/:orderId | Mark order ready |
| PATCH | /orders/restaurant/cancel/:orderId | Cancel with reason |

### Driver

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /orders/driver/my-orders | My orders |
| PATCH | /orders/driver/accept/:orderId | Accept order |
| PATCH | /orders/driver/decline/:orderId | Decline order |
| PUT | /orders/driver/update-status/:orderId | Update delivery status |

*Deliver order:*
json
{ "status": "delivered" }


### Admin — Cancellation Tracking

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /orders/cancellations/all | All cancellations |
| GET | /orders/cancellations/stats | Stats |
| GET | /orders/cancellations/restaurant/:id | By store |

---

## 💰 REFUNDS — /api/v1/refunds

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | /refunds/my | ✅ | any | My refunds |
| GET | /refunds/all | ✅ | admin | All refunds |
| GET | /refunds/stats | ✅ | admin | Refund stats |

> Refunds processed automatically every hour via cron. COD = instant. Razorpay = within 24h.

---

## 🧾 INVOICES — /api/v1/invoices

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /invoices | ✅ admin | All invoices |
| GET | /invoices/me | ✅ | My invoices |
| GET | /invoices/order/:orderId | ✅ | By order |
| GET | /invoices/:id | ✅ | By ID |

---

## 💰 LEDGER — /api/v1/ledger

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | /ledger | ✅ | admin | All entries |
| GET | /ledger/summary | ✅ | admin | Summary |
| GET | /ledger/batches | ✅ | admin | Payout batches |
| GET | /ledger/driver/dashboard | ✅ | driver | My earnings |
| GET | /ledger/restaurant/dashboard | ✅ | admin | Store earnings |


?party=store&status=pending&from=2026-01-01&to=2026-12-31
/ledger/restaurant/dashboard?restaurantId=xxx


---

## 🚗 DRIVERS — /api/v1/drivers

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | /drivers/all | ✅ | admin | All drivers |
| GET | /drivers/free | ✅ | admin | Available drivers |
| GET | /drivers/locations | ✅ | admin | All driver GPS locations |
| PUT | /drivers/toggle-online | ✅ | driver | Go online/offline |
| PUT | /drivers/reached-store | ✅ | driver | Mark returned to store |
| PUT | /drivers/update-location | ✅ | driver | Update GPS location |

*Update location (called every 10-15s):*
json
{ "lat": 22.7196, "lng": 75.8577, "speed": 30, "heading": 180 }


---

## 🔔 NOTIFICATIONS — /api/v1/notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /notifications/register-device | ✅ | Register FCM token |
| DELETE | /notifications/remove-device | ✅ | Remove token (on logout) |
| GET | /notifications/my | ✅ | Notification history |
| GET | /notifications/unread-count | ✅ | Badge count |
| PATCH | /notifications/:id/read | ✅ | Mark one read |
| PATCH | /notifications/read-all | ✅ | Mark all read |

json
{ "fcmToken": "your_fcm_token", "platform": "android" }


---

## ⭐ REVIEWS — /api/v1/reviews

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | /reviews | ✅ | any | Create review |
| GET | /reviews/my | ✅ | any | My reviews |
| DELETE | /reviews/:reviewId | ✅ | any | Delete my review |
| GET | /reviews/all | ✅ | admin | All reviews |
| PUT | /reviews/hide/:reviewId | ✅ | admin | Hide review |
| DELETE | /reviews/admin/:reviewId | ✅ | admin | Delete review |

---

## ❤️ WISHLIST — /api/v1/wishlist

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /wishlist | ✅ | Get wishlist |
| POST | /wishlist | ✅ | Add product |
| DELETE | /wishlist/:productId | ✅ | Remove product |
| DELETE | /wishlist | ✅ | Clear wishlist |

---

## 🔧 ADMIN — /api/v1/admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /admin/dashboard | ✅ admin | Full dashboard stats |
| GET | /admin/live-orders | ✅ admin | Live orders (preparing/ready) |
| GET | /admin/stats/revenue | ✅ admin | Revenue by date range |
| GET | /admin/stats/stores | ✅ admin | Store performance |
| GET | /admin/users | ✅ admin | All users (paginated) |
| GET | /admin/users/:id | ✅ admin | User details |
| PATCH | /admin/users/:id/role | ✅ admin | Change role |
| PATCH | /admin/users/:id/block | ✅ admin | Block/unblock user |


/admin/users?role=driver&search=faisal&page=1&limit=20
/admin/stats/revenue?from=2026-01-01&to=2026-12-31


---

## 💳 RAZORPAY — /api/v1/razorpay

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /razorpay/webhook | ❌ | Webhook (raw body) |

---

## 📌 Order Lifecycle


1. Customer places order → stock validated → coupon applied → payment
2. Payment confirmed → status: "preparing" → store notified (socket + push)
3. Store marks ready → PATCH /orders/restaurant/ready/:orderId
   OR Store cancels  → PATCH /orders/restaurant/cancel/:orderId { reason }
                       → Refund auto-created → customer push notification
4. Admin assigns driver → PUT /orders/assign-driver/:orderId
5. Driver accepts → PATCH /orders/driver/accept/:orderId
   OR Driver declines → PATCH /orders/driver/decline/:orderId
6. Driver picks up → PUT /orders/driver/update-status { status: "out_for_delivery" }
7. Driver delivers → PUT /orders/driver/update-status { status: "delivered" }
   → driver ledger created → customer push notification


---

## 📌 Business Rules

| Rule | Value |
|---|---|
| Minimum order | ₹100 |
| Delivery charge (₹100–₹299) | ₹30 |
| Delivery charge (₹300+) | FREE |
| Delivery area | Indore only (20km radius) |
| Platform commission | 10% of order value |
| JWT access token | 30 minutes |
| JWT refresh token | 90 days |
| Store payout | Every Monday 3 AM IST |
| Driver payout | 1st of month 3 AM IST |
| Refund processing | Every hour (within 24h) |
| Priority Refund | Within 1h if cancelled by user < 5m of ordering |
| OTP rate limit | 5 requests / 15 min |
| General rate limit | 200 requests / min |

---

## 📌 Postman Setup


Authorization: Bearer <token>
Content-Type: application/json
Content-Type: multipart/form-data  ← for grocery product images