const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toNumber = (value, field) => {
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw ApiError.badRequest(`Query parameter "${field}" must be a number`);
  }
  return num;
};

// Only these fields may be set by the client (never _id, timestamps, __v).
const UPDATABLE_FIELDS = [
  'name',
  'sku',
  'category',
  'price',
  'quantity',
  'reorderLevel',
  'supplier',
];

const pickUpdatable = (body = {}) => {
  const patch = {};
  UPDATABLE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) patch[field] = body[field];
  });
  return patch;
};

/* ------------------------------------------------------------------ */
/* @route   POST /api/products                                        */
/* @desc    Create a product                                          */
/* ------------------------------------------------------------------ */
const createProduct = asyncHandler(async (req, res) => {
  const { name, sku, category, price, quantity, reorderLevel, supplier } = req.body || {};

  const product = await Product.create({
    name,
    sku,
    category,
    price,
    quantity,
    reorderLevel,
    supplier,
  });

  res.status(201).json(product);
});

/* ------------------------------------------------------------------ */
/* @route   GET /api/products                                         */
/* @desc    List products with filtering, sorting and pagination      */
/* ------------------------------------------------------------------ */

// Sort fields accepted from the client, with their real schema names.
const SORT_FIELDS = {
  name: 'name',
  price: 'price',
  quantity: 'quantity',
  stockValue: 'stockValue', // handled in-memory below (it is a virtual)
  category: 'category',
  reorderLevel: 'reorderLevel',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

const getProducts = asyncHandler(async (req, res) => {
  const {
    category,
    supplier,
    search,
    inStock,
    minPrice,
    maxPrice,
    minQuantity,
    maxQuantity,
    sort = '-createdAt',
    page = 1,
    limit = 10,
  } = req.query;

  /* ----- build the filter object from the query string ----- */
  const filter = {};

  if (category) {
    filter.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' };
  }

  if (supplier) {
    filter.supplier = { $regex: escapeRegex(supplier), $options: 'i' };
  }

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ name: rx }, { sku: rx }, { supplier: rx }];
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = toNumber(minPrice, 'minPrice');
    if (maxPrice !== undefined) filter.price.$lte = toNumber(maxPrice, 'maxPrice');
  }

  if (minQuantity !== undefined || maxQuantity !== undefined) {
    filter.quantity = {};
    if (minQuantity !== undefined) filter.quantity.$gte = toNumber(minQuantity, 'minQuantity');
    if (maxQuantity !== undefined) filter.quantity.$lte = toNumber(maxQuantity, 'maxQuantity');
  }

  if (inStock === 'true') {
    filter.quantity = { ...(filter.quantity || {}), $gt: 0 };
  } else if (inStock === 'false') {
    filter.quantity = { ...(filter.quantity || {}), $lte: 0 };
  }

  /* ----- sorting ----- */
  const sortKey = String(sort).trim();
  const descending = sortKey.startsWith('-');
  const fieldName = SORT_FIELDS[descending ? sortKey.slice(1) : sortKey];

  if (!fieldName) {
    throw ApiError.badRequest(
      `Cannot sort by "${sortKey}". Allowed: ${Object.keys(SORT_FIELDS)
        .map((f) => `-${f}`)
        .join(', ')}`
    );
  }

  // stockValue is a virtual, so it cannot be sorted by MongoDB → sort in memory.
  const sortInMemory = fieldName === 'stockValue';
  const sortDir = descending ? -1 : 1;
  const sortSpec = sortInMemory ? { createdAt: -1 } : { [fieldName]: sortDir, _id: 1 };

  /* ----- pagination ----- */
  const pageNum = Math.max(1, toNumber(page, 'page'));
  const limitNum = Math.min(100, Math.max(1, toNumber(limit, 'limit')));
  const skip = (pageNum - 1) * limitNum;

  const total = await Product.countDocuments(filter);

  let query = Product.find(filter).sort(sortSpec);

  if (sortInMemory) {
    // fetch the filtered set, sort by the virtual, then paginate
    const all = await query.lean({ virtuals: true });
    all.sort((a, b) => (a.stockValue - b.stockValue) * sortDir);
    const products = all.slice(skip, skip + limitNum);
    return res.json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 0,
      count: products.length,
      products,
    });
  }

  const products = await query.skip(skip).limit(limitNum);

  res.json({
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 0,
    count: products.length,
    products,
  });
});

/* ------------------------------------------------------------------ */
/* @route   GET /api/products/:id                                     */
/* @desc    Get a single product by its ObjectId                      */
/* ------------------------------------------------------------------ */
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw ApiError.notFound(`No product found with id ${req.params.id}`);
  }

  res.json(product);
});

/* ------------------------------------------------------------------ */
/* @route   PUT /api/products/:id                                     */
/* @desc    Update product details                                    */
/* ------------------------------------------------------------------ */
const updateProduct = asyncHandler(async (req, res) => {
  const patch = pickUpdatable(req.body);

  if (Object.keys(patch).length === 0) {
    throw ApiError.badRequest(
      `Provide at least one field to update: ${UPDATABLE_FIELDS.join(', ')}`
    );
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    throw ApiError.notFound(`No product found with id ${req.params.id}`);
  }

  Object.assign(product, patch);
  await product.save(); // runs full schema validation

  res.json(product);
});

/* ------------------------------------------------------------------ */
/* @route   DELETE /api/products/:id                                  */
/* @desc    Delete a product                                          */
/* ------------------------------------------------------------------ */
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);

  if (!product) {
    throw ApiError.notFound(`No product found with id ${req.params.id}`);
  }

  res.json({ message: 'Product deleted', id: product._id.toString() });
});

/* ------------------------------------------------------------------ */
/* @route   PATCH /api/products/:id/stock                             */
/* @desc    Restock (+) or sell (-) units. Atomic, never below zero.   */
/* ------------------------------------------------------------------ */
const adjustStock = asyncHandler(async (req, res) => {
  const { change } = req.body || {};

  if (change === undefined || change === null || change === '') {
    throw ApiError.badRequest('"change" is required, e.g. { "change": 10 } or { "change": -3 }');
  }

  if (!Number.isInteger(Number(change)) || Number(change) === 0) {
    throw ApiError.badRequest('"change" must be a non-zero integer');
  }

  const delta = Number(change);

  // Load the document so we can validate the change against current stock.
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw ApiError.notFound(`No product found with id ${req.params.id}`);
  }

  const newQuantity = product.quantity + delta;

  if (newQuantity < 0) {
    throw ApiError.badRequest(
      `Insufficient stock: cannot reduce by ${Math.abs(delta)} when only ${product.quantity} unit(s) are available`,
      { currentQuantity: product.quantity, requestedChange: delta }
    );
  }

  // $inc is atomic — two concurrent sales can never lose an update.
  const updated = await Product.findByIdAndUpdate(
    product._id,
    { $inc: { quantity: delta } },
    { returnDocument: 'after', runValidators: true }
  );

  res.json({ message: 'Stock updated', product: updated });
});

/* ------------------------------------------------------------------ */
/* @route   GET /api/products/low-stock                               */
/* @desc    Products whose quantity has fallen to/below reorderLevel  */
/* ------------------------------------------------------------------ */
const getLowStockProducts = asyncHandler(async (req, res) => {
  const pipeline = [
    // compare two fields of the same document
    { $match: { $expr: { $lte: ['$quantity', '$reorderLevel'] } } },
  ];

  if (req.query.category) {
    pipeline.push({
      $match: { category: { $regex: `^${escapeRegex(req.query.category)}$`, $options: 'i' } },
    });
  }

  pipeline.push(
    // most urgent first
    { $addFields: { shortage: { $subtract: ['$reorderLevel', '$quantity'] } } },
    { $sort: { quantity: 1, shortage: -1 } }
  );

  const lowStockItems = await Product.aggregate(pipeline);

  res.json({ count: lowStockItems.length, lowStockItems });
});

/* ------------------------------------------------------------------ */
/* @route   GET /api/products/summary                                 */
/* @desc    Category-wise inventory report (aggregation pipeline)     */
/* ------------------------------------------------------------------ */
const getCategorySummary = asyncHandler(async (req, res) => {
  const summary = await Product.aggregate([
    {
      $group: {
        _id: '$category',
        totalItems: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        totalStockValue: { $sum: { $multiply: ['$price', '$quantity'] } },
        avgPrice: { $avg: '$price' },
      },
    },
    // richest inventory first
    { $sort: { totalStockValue: -1 } },
    {
      $project: {
        _id: 1,
        totalItems: 1,
        totalQuantity: 1,
        totalStockValue: { $round: ['$totalStockValue', 2] },
        avgPrice: { $round: ['$avgPrice', 2] },
      },
    },
  ]);

  res.json({ categories: summary.length, summary });
});

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  adjustStock,
  getLowStockProducts,
  getCategorySummary,
};
