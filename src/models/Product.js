const mongoose = require('mongoose');

/**
 * Product / Inventory schema.
 * Field-level validation is declared here so that every write path
 * (create, update, save) is validated by Mongoose before it reaches MongoDB.
 */
const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [3, 'Product name must be at least 3 characters long'],
      maxlength: [120, 'Product name cannot exceed 120 characters'],
    },

    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      trim: true,
      uppercase: true,
      // e.g. FURN-TB-812, STNY-PN-713
      match: [
        /^[A-Z]{2,6}-[A-Z0-9]{1,6}-\d{1,6}$/,
        'SKU must look like AAA-AA-000 (e.g. FURN-TB-812)',
      ],
    },

    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      enum: {
        values: ['Electronics', 'Furniture', 'Stationery', 'Apparel', 'Grocery'],
        message: '{VALUE} is not a supported category',
      },
    },

    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
      validate: {
        validator: Number.isFinite,
        message: 'Price must be a valid number',
      },
    },

    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be a whole number',
      },
      default: 0,
    },

    reorderLevel: {
      type: Number,
      min: [0, 'Reorder level cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Reorder level must be a whole number',
      },
      default: 5,
    },

    supplier: {
      type: String,
      trim: true,
      maxlength: [120, 'Supplier name cannot exceed 120 characters'],
      default: 'Unknown',
    },
  },
  {
    timestamps: true, // createdAt / updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ---------- Virtuals ---------- */

// Computed stock value: not stored in the database, always in sync.
productSchema.virtual('stockValue').get(function () {
  return this.price * this.quantity;
});

/* ---------- Indexes ---------- */

// category is the most common filter for the reports below
productSchema.index({ category: 1 });
// speeds up the low-stock $expr scan on large catalogues
productSchema.index({ quantity: 1, reorderLevel: 1 });

module.exports = mongoose.model('Product', productSchema);
