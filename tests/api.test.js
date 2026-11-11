/**
 * End-to-end API tests — Node's built-in test runner + global fetch.
 * No extra dependencies required.
 *
 * Run:  npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/inventory_test';

const app = require('../src/app');
const Product = require('../src/models/Product');

let server;
let base;

/** Helper: perform a request and return { status, body } */
const api = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const sample = (overrides = {}) => ({
  name: 'Test Widget',
  sku: 'TEST-WG-001',
  category: 'Electronics',
  price: 500,
  quantity: 10,
  reorderLevel: 4,
  supplier: 'Test Supplier',
  ...overrides,
});

test.before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Product.deleteMany({});
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await Product.deleteMany({});
  await mongoose.connection.close();
  await new Promise((r) => server.close(r));
});

test.beforeEach(async () => {
  await Product.deleteMany({});
});

/* ------------------------------------------------------------------ */
/* Create                                                             */
/* ------------------------------------------------------------------ */

test('POST /api/products creates a product and computes stockValue', async () => {
  const { status, body } = await api('POST', '/api/products', sample());
  assert.equal(status, 201);
  assert.equal(body.name, 'Test Widget');
  assert.equal(body.sku, 'TEST-WG-001');
  assert.equal(body.stockValue, 5000); // price * quantity virtual
  assert.ok(body.createdAt && body.updatedAt);
});

test('POST /api/products rejects a duplicate SKU with 409', async () => {
  await api('POST', '/api/products', sample());
  const { status, body } = await api('POST', '/api/products', sample({ name: 'Another' }));
  assert.equal(status, 409);
  assert.match(body.error, /already exists/i);
});

test('POST /api/products rejects invalid payload with 400 and details', async () => {
  const { status, body } = await api('POST', '/api/products', {
    name: 'AB',
    sku: 'bad-sku',
    category: 'Spaceships',
    price: -5,
    quantity: 1.5,
  });
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.ok(Array.isArray(body.details) && body.details.length >= 4);
});

test('POST /api/products rejects missing required fields', async () => {
  const { status } = await api('POST', '/api/products', {});
  assert.equal(status, 400);
});

/* ------------------------------------------------------------------ */
/* Read                                                               */
/* ------------------------------------------------------------------ */

test('GET /api/products paginates with total/page/totalPages/count', async () => {
  const items = Array.from({ length: 12 }, (_, i) =>
    sample({ sku: `TEST-PG-${100 + i}`, name: `Product ${i}`, price: 100 + i })
  );
  await Product.insertMany(items);

  const { status, body } = await api('GET', '/api/products?page=1&limit=10');
  assert.equal(status, 200);
  assert.equal(body.total, 12);
  assert.equal(body.page, 1);
  assert.equal(body.totalPages, 2);
  assert.equal(body.count, 10);
  assert.equal(body.products.length, 10);

  const page2 = await api('GET', '/api/products?page=2&limit=10');
  assert.equal(page2.body.count, 2);
});

test('GET /api/products filters by category, search and price range', async () => {
  await Product.insertMany([
    sample({ sku: 'ELEC-AA-001', name: 'Cheap Cable', category: 'Electronics', price: 99 }),
    sample({ sku: 'ELEC-AA-002', name: 'Expensive TV', category: 'Electronics', price: 45000 }),
    sample({ sku: 'FURN-AA-003', name: 'Wooden Desk', category: 'Furniture', price: 7000 }),
  ]);

  const byCat = await api('GET', '/api/products?category=Furniture');
  assert.equal(byCat.body.total, 1);
  assert.equal(byCat.body.products[0].name, 'Wooden Desk');

  const bySearch = await api('GET', '/api/products?search=tv');
  assert.equal(bySearch.body.total, 1);
  assert.equal(bySearch.body.products[0].name, 'Expensive TV');

  const byPrice = await api('GET', '/api/products?minPrice=1000&maxPrice=10000');
  assert.equal(byPrice.body.total, 1);
  assert.equal(byPrice.body.products[0].name, 'Wooden Desk');
});

test('GET /api/products sorts ascending and descending', async () => {
  await Product.insertMany([
    sample({ sku: 'TEST-SR-001', price: 300, name: 'Alpha Item' }),
    sample({ sku: 'TEST-SR-002', price: 100, name: 'Beta Item' }),
    sample({ sku: 'TEST-SR-003', price: 200, name: 'Gamma Item' }),
  ]);

  const asc = await api('GET', '/api/products?sort=price');
  assert.deepEqual(asc.body.products.map((p) => p.price), [100, 200, 300]);

  const desc = await api('GET', '/api/products?sort=-price');
  assert.deepEqual(desc.body.products.map((p) => p.price), [300, 200, 100]);
});

test('GET /api/products rejects an unsupported sort field', async () => {
  const { status } = await api('GET', '/api/products?sort=password');
  assert.equal(status, 400);
});

test('GET /api/products/:id returns one product, 404 when missing, 400 when malformed', async () => {
  const created = await api('POST', '/api/products', sample());

  const ok = await api('GET', `/api/products/${created.body._id}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.sku, 'TEST-WG-001');

  const missing = await api('GET', `/api/products/${new mongoose.Types.ObjectId()}`);
  assert.equal(missing.status, 404);

  const malformed = await api('GET', '/api/products/not-an-id');
  assert.equal(malformed.status, 400);
});

/* ------------------------------------------------------------------ */
/* Update / delete                                                    */
/* ------------------------------------------------------------------ */

test('PUT /api/products/:id updates fields and re-runs validation', async () => {
  const { body: created } = await api('POST', '/api/products', sample());

  const updated = await api('PUT', `/api/products/${created._id}`, {
    price: 750,
    quantity: 20,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.price, 750);
  assert.equal(updated.body.quantity, 20);
  assert.equal(updated.body.stockValue, 15000);
  assert.equal(updated.body.name, 'Test Widget'); // untouched

  const invalid = await api('PUT', `/api/products/${created._id}`, { price: -1 });
  assert.equal(invalid.status, 400);
});

test('DELETE /api/products/:id removes the product and returns a message', async () => {
  const { body: created } = await api('POST', '/api/products', sample());

  const del = await api('DELETE', `/api/products/${created._id}`);
  assert.equal(del.status, 200);
  assert.deepEqual(del.body, { message: 'Product deleted', id: created._id });

  const gone = await api('GET', `/api/products/${created._id}`);
  assert.equal(gone.status, 404);
});

/* ------------------------------------------------------------------ */
/* Stock adjustment                                                   */
/* ------------------------------------------------------------------ */

test('PATCH /api/products/:id/stock increments and decrements stock', async () => {
  const { body: created } = await api('POST', '/api/products', sample({ quantity: 10 }));

  const restock = await api('PATCH', `/api/products/${created._id}/stock`, { change: 10 });
  assert.equal(restock.status, 200);
  assert.equal(restock.body.message, 'Stock updated');
  assert.equal(restock.body.product.quantity, 20);

  const sale = await api('PATCH', `/api/products/${created._id}/stock`, { change: -5 });
  assert.equal(sale.body.product.quantity, 15);
});

test('PATCH /api/products/:id/stock blocks a sale larger than available stock', async () => {
  const { body: created } = await api('POST', '/api/products', sample({ quantity: 3 }));

  const { status, body } = await api('PATCH', `/api/products/${created._id}/stock`, { change: -5 });
  assert.equal(status, 400);
  assert.match(body.error, /insufficient stock/i);
  assert.equal(body.details.currentQuantity, 3);
});

test('PATCH /api/products/:id/stock rejects zero, non-integer and missing change', async () => {
  const { body: created } = await api('POST', '/api/products', sample());
  const url = `/api/products/${created._id}/stock`;

  assert.equal((await api('PATCH', url, { change: 0 })).status, 400);
  assert.equal((await api('PATCH', url, { change: 1.5 })).status, 400);
  assert.equal((await api('PATCH', url, {})).status, 400);
});

/* ------------------------------------------------------------------ */
/* Aggregation reports                                                */
/* ------------------------------------------------------------------ */

test('GET /api/products/low-stock returns only quantity <= reorderLevel', async () => {
  await Product.insertMany([
    sample({ sku: 'TEST-LS-001', name: 'Critical', quantity: 0, reorderLevel: 5 }),
    sample({ sku: 'TEST-LS-002', name: 'At threshold', quantity: 5, reorderLevel: 5 }),
    sample({ sku: 'TEST-LS-003', name: 'Healthy', quantity: 50, reorderLevel: 5 }),
  ]);

  const { status, body } = await api('GET', '/api/products/low-stock');
  assert.equal(status, 200);
  assert.equal(body.count, 2);
  const names = body.lowStockItems.map((p) => p.name);
  assert.ok(names.includes('Critical'));
  assert.ok(names.includes('At threshold'));
  assert.ok(!names.includes('Healthy'));
  assert.equal(body.lowStockItems[0].name, 'Critical'); // most urgent first
});

test('GET /api/products/summary groups by category with totals and averages', async () => {
  await Product.insertMany([
    sample({ sku: 'ELEC-SM-001', category: 'Electronics', price: 1000, quantity: 2 }),
    sample({ sku: 'ELEC-SM-002', category: 'Electronics', price: 3000, quantity: 4 }),
    sample({ sku: 'FURN-SM-003', category: 'Furniture', price: 5000, quantity: 1 }),
  ]);

  const { status, body } = await api('GET', '/api/products/summary');
  assert.equal(status, 200);
  assert.equal(body.categories, 2);

  const electronics = body.summary.find((s) => s._id === 'Electronics');
  assert.equal(electronics.totalItems, 2);
  assert.equal(electronics.totalQuantity, 6);
  assert.equal(electronics.totalStockValue, 14000);
  assert.equal(electronics.avgPrice, 2000);
});

/* ------------------------------------------------------------------ */
/* Misc                                                               */
/* ------------------------------------------------------------------ */

test('GET /api/health returns ok', async () => {
  const { status, body } = await api('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
});

test('Unknown routes return a JSON 404', async () => {
  const { status, body } = await api('GET', '/api/nope');
  assert.equal(status, 404);
  assert.match(body.error, /Route not found/);
});
