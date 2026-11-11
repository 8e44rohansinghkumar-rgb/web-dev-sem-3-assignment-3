# Inventory & Data Management System — REST API

**Assignment 3 · Web Dev III · Unit 3 (CO3)** — a database-driven backend for a store/warehouse
product catalogue, built with **Node.js, Express.js, MongoDB, Mongoose and dotenv**.

| | |
|---|---|
| **Stack** | Node.js 20+, Express 5, MongoDB 8, Mongoose 9, dotenv |
| **Base URL** | `http://localhost:5000` |
| **Collection** | `products` in database `inventory_db` |
| **Tests** | 18 automated integration tests + 43-check end-to-end script (all passing) |

---

## 1. Quick start

```bash
cd inventory-api
npm install

cp .env.example .env          # then edit MONGO_URI if needed

npm run seed                  # loads 12 sample products across 5 categories
npm start                     # http://localhost:5000/api/products
```

Verify the running server end-to-end (second terminal):

```bash
npm run verify                # 43-check pass/fail checklist
npm test                      # 18 automated tests (uses inventory_test DB)
```

### `.env`

```ini
PORT=5000
NODE_ENV=development

# local MongoDB
MONGO_URI=mongodb://127.0.0.1:27017/inventory_db

# or MongoDB Atlas
# MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/inventory_db
```

> `.env` is git-ignored; only `.env.example` is committed. No secret ever enters the code.

---

## 2. Project structure

```
inventory-api/
├── src/
│   ├── app.js                        # express app: middleware, routes, error handling
│   ├── server.js                   # dotenv → connectDB → listen → graceful shutdown
│   ├── config/db.js                # Mongoose connection
│   ├── models/Product.js           # schema, field validation, virtuals, indexes
│   ├── controllers/product.controller.js   # all 8 handlers
│   ├── routes/
│   │   ├── product.routes.js       # /api/products endpoints
│   │   └── health.routes.js        # /api/health
│   ├── middleware/
│   │   ├── validateProduct.js      # request-body validation (create/update/stock)
│   │   ├── validateObjectId.js     # guards :id → clean 400 instead of CastError
│   │   └── errorHandler.js         # centralised error handler + 404 fallback
│   └── utils/
│       ├── ApiError.js             # HTTP-aware error class
│       └── asyncHandler.js         # forwards async rejections to Express
├── tests/api.test.js               # 18 integration tests (node:test, no extra deps)
├── scripts/verify.js               # live end-to-end demonstration checklist
├── seed.js                         # sample catalogue
├── postman_collection.json         # ready-to-import Postman requests
└── .env.example
```

---

## 3. Data model

```js
{
  name:         String,   required, 3–120 chars, trimmed
  sku:          String,   required, unique, uppercase, /^[A-Z]{2,6}-[A-Z0-9]{1,6}-\d{1,6}$/
  category:     String,   required, enum: Electronics | Furniture | Stationery | Apparel | Grocery
  price:       Number,   required, >= 0, finite
  quantity:    Number,   required, >= 0, integer, default 0
  reorderLevel:Number,   >= 0, integer, default 5
  supplier:     String,   <= 120 chars, default "Unknown"
  createdAt / updatedAt : Date (timestamps: true)

  // virtual, computed on read — never stored, never stale
  stockValue = price × quantity
}
```

Indexes: `sku` (unique), `category`, `{ quantity, reorderLevel }` (low-stock report).

**Validation layers**

1. **Middleware** (`validateProduct.js`) — fast, aggregated field-level messages before touching the DB.
2. **Mongoose schema** — the real safety net; catches every write path including direct model use.
3. **MongoDB unique index** — race-proof duplicate-SKU protection → `409`.

---

## 4. API reference

All responses are JSON. Errors share one shape:

```json
{ "success": false, "error": "Validation failed", "details": ["...", "..."] }
```

### 4.1 Create Product — `POST /api/products` → `201`

```json
{
  "name": "Gel Pen Pack of 15",
  "sku": "STNY-PN-713",
  "category": "Stationery",
  "price": 120,
  "quantity": 40,
  "reorderLevel": 20,
  "supplier": "Cello Pens"
}
```

```json
{
  "name": "Gel Pen Pack of 15", "sku": "STNY-PN-713", "category": "Stationery",
  "price": 120, "quantity": 40, "reorderLevel": 20, "supplier": "Cello Pens",
  "_id": "6a547727f6123427d6e61d7c",
  "createdAt": "2026-07-13T05:27:03.054Z", "updatedAt": "2026-07-13T05:27:03.054Z",
  "__v": 0, "stockValue": 4800, "id": "6a547727f6123427d6e61d7c"
}
```

Errors: `400` validation · `409` duplicate SKU.

### 4.2 Get All Products — `GET /api/products` → `200`

| Query param | Description |
|---|---|
| `category` | exact match, case-insensitive |
| `search` | regex match on **name**, **sku**, **supplier** |
| `supplier` | partial, case-insensitive |
| `minPrice` / `maxPrice` | price range (inclusive) |
| `minQuantity` / `maxQuantity` | stock range |
| `inStock` | `true` → quantity > 0, `false` → quantity = 0 |
| `sort` | `name`, `price`, `quantity`, `stockValue`, `category`, `reorderLevel`, `createdAt`, `updatedAt`; prefix `-` for descending (default `-createdAt`) |
| `page` | default `1` |
| `limit` | default `10`, max `100` |

```json
{
  "total": 12, "page": 1, "limit": 10, "totalPages": 2, "count": 10,
  "products": [ { "...": "..." } ]
}
```

Example: `GET /api/products?category=Electronics&minPrice=500&sort=-price&page=1&limit=5`

### 4.3 Get Single Product — `GET /api/products/:id` → `200`

Errors: `404` not found · `400` malformed ObjectId.

### 4.4 Update Product — `PUT /api/products/:id` → `200`

Accepts any subset of `name, sku, category, price, quantity, reorderLevel, supplier`.
Untouched fields are preserved and the **full schema is re-validated** before saving.

```json
{ "name": "Gel Pen Pack of 15", "sku": "STNY-PN-713", "category": "Stationery", "price": 140, "quantity": 60 }
```

Errors: `400` validation / empty patch · `404` not found · `409` duplicate SKU.

### 4.5 Adjust Stock — `PATCH /api/products/:id/stock` → `200`

```json
{ "change": 10 }     // restock: +10
{ "change": -3 }     // sale:    -3
```

```json
{ "message": "Stock updated", "product": { "quantity": 70, "stockValue": 9800, "...": "..." } }
```

Implementation notes:

- Uses `$inc`, which is **atomic** — concurrent sales can never lose an update.
- Loads the document first so an over-sale is rejected instead of driving stock negative:

```json
{ "success": false,
  "error": "Insufficient stock: cannot reduce by 1000 when only 45 unit(s) are available",
  "details": { "currentQuantity": 45, "requestedChange": -1000 } }
```

Errors: `400` missing / non-integer / zero `change`, insufficient stock · `404` not found.

### 4.6 Delete Product — `DELETE /api/products/:id` → `200`

```json
{ "message": "Product deleted", "id": "6a547727f6123427d6e61d7c" }
```

Errors: `404` not found.

### 4.7 Low-Stock Report — `GET /api/products/low-stock` → `200`

Aggregation pipeline: `$match` with `$expr` (compares two fields of the same document),
optional category filter, `$addFields` shortage, `$sort` most urgent first.

```json
{ "count": 4, "lowStockItems": [ { "name": "Organic Green Tea 250g", "quantity": 0, "reorderLevel": 12, "...": "..." } ] }
```

Add `?category=Furniture` to narrow the report.

### 4.8 Category Summary — `GET /api/products/summary` → `200`

`$group` by category → `$sort` by stock value → `$project` with `$round`.

```json
{
  "categories": 5,
  "summary": [
    { "_id": "Electronics", "totalItems": 4, "totalQuantity": 96,
      "totalStockValue": 225079, "avgPrice": 2536.75 }
  ]
}
```

### 4.9 Health — `GET /api/health` → `200`

```json
{ "status": "ok", "service": "Inventory & Data Management API", "uptime": 12.4, "timestamp": "..." }
```

---

## 5. Error handling

`errorHandler.js` is the **single** exit point for every failure and normalises:

| Source | Status | Message |
|---|---|---|
| `ApiError` from controllers | as thrown | as thrown |
| Mongoose `ValidationError` | 400 | `Validation failed` + `details[]` |
| Mongoose `CastError` | 400 | `Invalid value for "<field>"` |
| MongoDB duplicate key (`11000`) | 409 | `A product with this sku already exists` |
| Malformed JSON body | 400 | `Request body contains invalid JSON` |
| Unmatched route | 404 | `Route not found: GET /api/nope` |
| Unexpected bug | 500 | `Internal server error` (stack only in development) |

Async controllers are wrapped in `asyncHandler` so a rejected promise never crashes Node.

---

## 6. Tests & verification

```
$ npm test
# tests 18 · # pass 18 · # fail 0

$ npm run verify
43 passed, 0 failed, 43 checks total
```

`npm test` spins the Express app on an ephemeral port against a real MongoDB
(`inventory_test`), wipes the collection between tests, and covers:
create, duplicate SKU, validation, pagination, filtering, search, sorting, single
fetch, 404, malformed id, update, delete, stock increment/decrement/over-sale,
low-stock aggregation, category summary, health, and 404 routing.

`npm run verify` is the in-class demo: it prints a readable ✅/❌ checklist against
the running server.

---

## 7. Design decisions (why it is built this way)

- **Validation in two places** — middleware gives a client-friendly list of all problems at
  once; the schema still guards every path (seed script, direct model calls, future code).
- **`stockValue` as a virtual** — price × quantity can never drift out of sync because it is
  never stored. Sorting by it is handled in memory since Mongo cannot sort on a virtual.
- **`$inc` for stock** — atomic update, safe under concurrent sales.
- **Route ordering** — `/low-stock` and `/summary` are declared before `/:id`, otherwise
  Express would treat them as ObjectIds.
- **Allow-list for updates** — a client can never overwrite `_id`, `createdAt` or `__v`.
- **No extra dependencies** — only Express, Mongoose and dotenv, per the assignment restriction.
  Tests use Node's built-in `node:test` runner.

---

## 8. Rubric mapping

| Criterion (marks) | Where it is demonstrated |
|---|---|
| **Database Schema Design & Validation (0.5)** | `src/models/Product.js` — required fields, enum, min/max, regex SKU, integer checks, unique index, timestamps, virtual; plus `src/middleware/validateProduct.js` |
| **CRUD Functionality (0.75)** | `POST` / `GET` / `GET :id` / `PUT` / `DELETE` in `product.controller.js`, all mapped in `product.routes.js`, proven by tests 1–4, 9–11 |
| **Querying — Filtering, Sorting, Pagination (0.5)** | `getProducts`: 8 filter params, 8 sortable fields, `page`/`limit` with `total`/`totalPages`/`count` envelope; tests 5–8 |
| **Aggregation — Low-Stock & Category Summary (0.5)** | `getLowStockProducts` (`$expr`, `$addFields`, `$sort`) and `getCategorySummary` (`$group`, `$sum`, `$multiply`, `$avg`, `$round`); tests 15–16 |
| **API Design & Clean Code (0.25)** | Layered `routes → controller → model`, centralised error handling, `ApiError`/`asyncHandler`, `.env` via dotenv, consistent JSON envelopes, README + Postman collection + tests |

---

## 9. Postman

Import `postman_collection.json`. It contains all 12 requests in the order used for the
demonstration; the **Create** request stores the new `_id` into the `productId` collection
variable so the later `GET/PUT/PATCH/DELETE` requests work immediately.

## 10. Notes

- Requires Node.js **18+** (global `fetch` and `node:test`).
- If MongoDB is not installed locally, either install MongoDB Community Server or point
  `MONGO_URI` at a free MongoDB Atlas cluster.
- `npm run seed` wipes the `products` collection first; use `npm run seed -- --keep` to append.
