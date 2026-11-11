const express = require('express');
const productRoutes = require('./routes/product.routes');
const healthRoutes = require('./routes/health.routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

/* ---------------- global middleware ---------------- */
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// minimal request logger (no extra dependencies allowed)
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms)`);
  });
  next();
});

/* ---------------- routes ---------------- */
app.get('/', (req, res) => {
  res.json({
    name: 'Inventory & Data Management System API',
    version: '1.0.0',
    endpoints: {
      createProduct: 'POST /api/products',
      listProducts: 'GET /api/products?category=&search=&minPrice=&maxPrice=&sort=-price&page=1&limit=10',
      getProduct: 'GET /api/products/:id',
      updateProduct: 'PUT /api/products/:id',
      deleteProduct: 'DELETE /api/products/:id',
      adjustStock: 'PATCH /api/products/:id/stock  {"change": 10}',
      lowStockReport: 'GET /api/products/low-stock',
      categorySummary: 'GET /api/products/summary',
      health: 'GET /api/health',
    },
  });
});

app.use('/api/health', healthRoutes);
app.use('/api/products', productRoutes);

/* ---------------- error handling (must be last) ---------------- */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
