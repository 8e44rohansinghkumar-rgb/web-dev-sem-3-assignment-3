const ApiError = require('../utils/ApiError');

/**
 * Centralised error handler — the single place that turns any thrown error
 * (custom ApiError, Mongoose validation/cast/duplicate-key, or unexpected bug)
 * into a consistent JSON payload.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  /* ---- Mongoose: schema validation failed ---- */
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => e.message);
  }

  /* ---- Mongoose: bad ObjectId / bad cast ---- */
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for "${err.path}": ${err.value}`;
  }

  /* ---- MongoDB: unique index violation (e.g. duplicate SKU) ---- */
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    message = `A product with this ${field} already exists`;
    details = err.keyValue ? [err.keyValue] : null;
  }

  /* ---- Malformed JSON body from express.json() ---- */
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body contains invalid JSON';
  }

  if (statusCode >= 500) {
    console.error('[UNHANDLED ERROR]', err);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(details ? { details } : {}),
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500
      ? { stack: err.stack }
      : {}),
  });
};

/**
 * 404 fallback for any route that did not match.
 */
const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

module.exports = { errorHandler, notFound };
