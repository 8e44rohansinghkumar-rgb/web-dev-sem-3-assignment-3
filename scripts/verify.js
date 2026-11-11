/**
 * End-to-end verification / demo script.
 *
 * Exercises every requirement of Assignment 3 against a RUNNING server and
 * prints a pass/fail checklist. Useful as the in-class demonstration.
 *
 * Usage:
 *   npm start            # in one terminal
 *   node scripts/verify.js   # in another
 *
 * Env: BASE_URL (default http://localhost:5000)
 */
const BASE = process.env.BASE_URL || 'http://localhost:5000';

let passed = 0;
let failed = 0;
const results = [];

const call = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
};

const check = (label, condition, extra = '') => {
  if (condition) {
    passed += 1;
    results.push(`  ✅ ${label}${extra ? ` — ${extra}` : ''}`);
  } else {
    failed += 1;
    results.push(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`);
  }
};

const section = (title) => results.push(`\n${title}`);

const run = async () => {
  const unique = Date.now().toString().slice(-6);
  let id;

  /* ---------------- health ---------------- */
  section('0. Server health');
  const health = await call('GET', '/api/health');
  check('GET /api/health returns 200 ok', health.status === 200 && health.body.status === 'ok');

  /* ---------------- create ---------------- */
  section('1. Create Product — POST /api/products');
  const create = await call('POST', '/api/products', {
    name: 'Gel Pen Pack of 15',
    sku: `STNY-PN-${unique}`.slice(0, 12),
    category: 'Stationery',
    price: 120,
    quantity: 40,
    reorderLevel: 20,
    supplier: 'Cello Pens',
  });
  if (create.status === 201) id = create.body._id;
  check('returns 201 Created', create.status === 201);
  check('auto-generates _id', Boolean(create.body?._id));
  check('sets createdAt / updatedAt', Boolean(create.body?.createdAt && create.body?.updatedAt));
  check(
    'computes stockValue virtual',
    create.body?.stockValue === 4800,
    `₹${create.body?.stockValue}`
  );

  /* ---------------- validation ---------------- */
  section('2. Schema validation');
  const bad = await call('POST', '/api/products', {
    name: 'AB',
    sku: 'bad-sku',
    category: 'Spaceships',
    price: -5,
    quantity: 1.5,
  });
  check('invalid payload → 400', bad.status === 400);
  check(
    'returns field-level error details',
    Array.isArray(bad.body?.details) && bad.body.details.length >= 4,
    `${bad.body?.details?.length} errors`
  );

  const dup = await call('POST', '/api/products', {
    name: 'Duplicate SKU Test',
    sku: create.body.sku,
    category: 'Stationery',
    price: 100,
    quantity: 1,
  });
  check('duplicate SKU (unique index) → 409', dup.status === 409);

  /* ---------------- list ---------------- */
  section('3. Get All Products — filtering, sorting, pagination');
  const list = await call('GET', '/api/products?page=1&limit=10');
  check('returns 200', list.status === 200);
  check(
    'envelope has total/page/limit/totalPages/count',
    ['total', 'page', 'limit', 'totalPages', 'count'].every((k) => k in (list.body || {}))
  );
  check('respects limit', list.body.count <= 10, `count=${list.body.count}, total=${list.body.total}`);
  check(
    'totalPages = ceil(total/limit)',
    list.body.totalPages === Math.ceil(list.body.total / list.body.limit)
  );

  const p2 = await call('GET', '/api/products?page=2&limit=10');
  check('page 2 returns the remainder', p2.body.page === 2);

  const filtered = await call('GET', '/api/products?category=Electronics');
  check(
    'filters by category',
    filtered.body.products.every((p) => p.category === 'Electronics'),
    `${filtered.body.total} match(es)`
  );

  const searched = await call('GET', '/api/products?search=pen');
  check('searches name/SKU/supplier', searched.body.total >= 1, `${searched.body.total} match(es)`);

  const priced = await call('GET', '/api/products?minPrice=1000&maxPrice=5000');
  check(
    'filters by price range',
    priced.body.products.every((p) => p.price >= 1000 && p.price <= 5000)
  );

  const sorted = await call('GET', '/api/products?sort=-price&limit=100');
  const prices = sorted.body.products.map((p) => p.price);
  check(
    'sorts by -price (descending)',
    prices.every((v, i) => i === 0 || prices[i - 1] >= v)
  );

  const badSort = await call('GET', '/api/products?sort=hacked');
  check('rejects unknown sort field → 400', badSort.status === 400);

  /* ---------------- single ---------------- */
  section('4. Get Single Product — GET /api/products/:id');
  const one = await call('GET', `/api/products/${id}`);
  check('returns 200 with the product', one.status === 200 && one.body._id === id);
  const missing = await call('GET', '/api/products/64b7f0c2a1b2c3d4e5f60718');
  check('unknown id → 404', missing.status === 404);
  const malformed = await call('GET', '/api/products/not-an-objectid');
  check('malformed id → 400 (no crash)', malformed.status === 400);

  /* ---------------- update ---------------- */
  section('5. Update Product — PUT /api/products/:id');
  const upd = await call('PUT', `/api/products/${id}`, { price: 140, quantity: 60 });
  check('returns 200', upd.status === 200);
  check('applies price change', upd.body.price === 140);
  check('recomputes stockValue', upd.body.stockValue === 8400, `₹${upd.body.stockValue}`);
  check('keeps untouched fields', upd.body.supplier === 'Cello Pens');
  const badUpd = await call('PUT', `/api/products/${id}`, { price: -10 });
  check('invalid update → 400', badUpd.status === 400);

  /* ---------------- stock ---------------- */
  section('6. Stock adjustment — PATCH /api/products/:id/stock');
  const restock = await call('PATCH', `/api/products/${id}/stock`, { change: 10 });
  check('restock +10 → 200', restock.status === 200 && restock.body.message === 'Stock updated');
  check('quantity increased to 70', restock.body.product.quantity === 70);

  const sale = await call('PATCH', `/api/products/${id}/stock`, { change: -25 });
  check('sale -25 works', sale.body.product.quantity === 45);

  const oversell = await call('PATCH', `/api/products/${id}/stock`, { change: -1000 });
  check('over-sale blocked → 400 insufficient stock', oversell.status === 400);
  check(
    'reports current quantity in error details',
    oversell.body?.details?.currentQuantity === 45
  );

  const zero = await call('PATCH', `/api/products/${id}/stock`, { change: 0 });
  check('change=0 rejected → 400', zero.status === 400);

  /* ---------------- reports ---------------- */
  section('7. Low-Stock Report — GET /api/products/low-stock');
  const low = await call('GET', '/api/products/low-stock');
  check('returns 200', low.status === 200);
  check('exposes count + lowStockItems', low.body.count === low.body.lowStockItems.length);
  check(
    'every item has quantity <= reorderLevel',
    low.body.lowStockItems.every((p) => p.quantity <= p.reorderLevel),
    `${low.body.count} item(s)`
  );

  section('8. Category Summary — GET /api/products/summary');
  const sum = await call('GET', '/api/products/summary');
  check('returns 200', sum.status === 200);
  check('one row per category', sum.body.categories === sum.body.summary.length);
  const fields = ['totalItems', 'totalQuantity', 'totalStockValue', 'avgPrice'];
  check(
    'rows include totalItems/totalQuantity/totalStockValue/avgPrice',
    sum.body.summary.every((r) => fields.every((f) => r[f] !== undefined))
  );
  const grandUnits = sum.body.summary.reduce((a, r) => a + r.totalQuantity, 0);
  check('aggregated units are consistent', grandUnits >= 0, `${grandUnits} units total`);

  /* ---------------- delete ---------------- */
  section('9. Delete Product — DELETE /api/products/:id');
  const del = await call('DELETE', `/api/products/${id}`);
  check('returns 200 with message', del.status === 200 && del.body.message === 'Product deleted');
  check('echoes deleted id', del.body.id === id);
  const after = await call('GET', `/api/products/${id}`);
  check('product is gone → 404', after.status === 404);

  /* ---------------- 404 ---------------- */
  section('10. Error handling');
  const nope = await call('GET', '/api/does-not-exist');
  check('unknown route → JSON 404', nope.status === 404 && /route not found/i.test(nope.body.error));

  /* ---------------- print ---------------- */
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  END-TO-END VERIFICATION — ${BASE}`);
  console.log(`${'═'.repeat(64)}`);
  console.log(results.join('\n'));
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} checks total`);
  console.log(`${'─'.repeat(64)}\n`);

  process.exit(failed === 0 ? 0 : 1);
};

run().catch((err) => {
  console.error('\nVerification could not run:', err.message);
  console.error('Is the API running?  →  npm start\n');
  process.exit(1);
});
