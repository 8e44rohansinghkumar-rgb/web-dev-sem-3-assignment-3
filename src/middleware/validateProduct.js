const ApiError = require('../utils/ApiError');

const CATEGORIES = ['Electronics', 'Furniture', 'Stationery', 'Apparel', 'Grocery'];
const SKU_PATTERN = /^[A-Z]{2,6}-[A-Z0-9]{1,6}-\d{1,6}$/;

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Builds a middleware that validates the request body before Mongoose
 * is ever touched, so the client gets one clear list of problems.
 *
 * @param {'create'|'update'} mode
 */
const validateProductBody = (mode = 'create') => (req, res, next) => {
  const body = req.body || {};
  const errors = [];
  const isCreate = mode === 'create';

  /* ----- name ----- */
  if (isCreate || body.name !== undefined) {
    if (isBlank(body.name)) errors.push('name is required');
    else if (String(body.name).trim().length < 3) errors.push('name must be at least 3 characters');
    else if (String(body.name).length > 120) errors.push('name cannot exceed 120 characters');
  }

  /* ----- sku ----- */
  if (isCreate || body.sku !== undefined) {
    if (isBlank(body.sku)) errors.push('sku is required');
    else if (!SKU_PATTERN.test(String(body.sku).trim().toUpperCase()))
      errors.push('sku must match AAA-AA-000 (e.g. FURN-TB-812)');
  }

  /* ----- category ----- */
  if (isCreate || body.category !== undefined) {
    if (isBlank(body.category)) errors.push('category is required');
    else if (!CATEGORIES.includes(body.category))
      errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);
  }

  /* ----- price ----- */
  if (isCreate || body.price !== undefined) {
    if (isBlank(body.price)) errors.push('price is required');
    else if (typeof body.price !== 'number' || Number.isNaN(body.price))
      errors.push('price must be a number');
    else if (body.price < 0) errors.push('price cannot be negative');
  }

  /* ----- quantity ----- */
  if (body.quantity !== undefined) {
    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity))
      errors.push('quantity must be a whole number');
    else if (body.quantity < 0) errors.push('quantity cannot be negative');
  }

  /* ----- reorderLevel ----- */
  if (body.reorderLevel !== undefined) {
    if (typeof body.reorderLevel !== 'number' || !Number.isInteger(body.reorderLevel))
      errors.push('reorderLevel must be a whole number');
    else if (body.reorderLevel < 0) errors.push('reorderLevel cannot be negative');
  }

  /* ----- supplier ----- */
  if (body.supplier !== undefined) {
    if (typeof body.supplier !== 'string') errors.push('supplier must be a string');
    else if (body.supplier.length > 120) errors.push('supplier cannot exceed 120 characters');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  return next();
};

/**
 * Validates the PATCH /:id/stock body.
 */
const validateStockChange = (req, res, next) => {
  const { change } = req.body || {};

  if (isBlank(change)) {
    return next(ApiError.badRequest('"change" is required, e.g. { "change": 10 } or { "change": -3 }'));
  }

  if (typeof change !== 'number' || !Number.isInteger(change)) {
    return next(ApiError.badRequest('"change" must be a whole number'));
  }

  if (change === 0) {
    return next(ApiError.badRequest('"change" cannot be zero'));
  }

  return next();
};

module.exports = { validateProductBody, validateStockChange, CATEGORIES };
