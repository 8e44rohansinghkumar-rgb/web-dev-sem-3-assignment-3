const mongoose = require('mongoose');

/**
 * Guards every /:id route. An invalid ObjectId would otherwise throw a
 * CastError — this returns a clean 400 instead.
 */
const validateObjectId = (paramName = 'id') => (req, res, next) => {
  const value = req.params[paramName];

  if (!mongoose.Types.ObjectId.isValid(value)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid id format',
      message: `"${value}" is not a valid MongoDB ObjectId`,
    });
  }

  return next();
};

module.exports = validateObjectId;
