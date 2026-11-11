/**
 * Seed script — loads a realistic 12-product catalogue (5 categories)
 * so every endpoint in the lab can be demonstrated immediately.
 *
 * Usage:
 *   npm run seed          # wipe + insert sample products
 *   npm run seed -- --keep  # insert without wiping existing data
 */
require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const Product = require('./src/models/Product');

const products = [
  /* ---------------- Electronics (4 items, 96 units) ---------------- */
  {
    name: 'Bluetooth Speaker 20W',
    sku: 'ELEC-BS-101',
    category: 'Electronics',
    price: 2499,
    quantity: 30,
    reorderLevel: 10,
    supplier: 'boAt Lifestyle',
  },
  {
    name: 'USB-C Fast Charger 65W',
    sku: 'ELEC-UC-205',
    category: 'Electronics',
    price: 1899,
    quantity: 26,
    reorderLevel: 8,
    supplier: 'Anker India',
  },
  {
    name: 'Wireless Mouse Pro',
    sku: 'ELEC-WM-311',
    category: 'Electronics',
    price: 1450,
    quantity: 25,
    reorderLevel: 10,
    supplier: 'Logitech India',
  },
  {
    name: 'Mechanical Keyboard TKL',
    sku: 'ELEC-MK-440',
    category: 'Electronics',
    price: 4299,
    quantity: 15,
    reorderLevel: 6,
    supplier: 'Logitech India',
  },

  /* ---------------- Apparel (2 items, 78 units) ---------------- */
  {
    name: 'Cotton Casual Shirt',
    sku: 'APRL-CS-120',
    category: 'Apparel',
    price: 1299,
    quantity: 45,
    reorderLevel: 12,
    supplier: 'Allen Solly',
  },
  {
    name: 'Running Shoes Mesh',
    sku: 'APRL-RS-330',
    category: 'Apparel',
    price: 1499,
    quantity: 33,
    reorderLevel: 10,
    supplier: 'Campus Footwear',
  },

  /* ---------------- Stationery (3 items) ---------------- */
  {
    name: 'Gel Pen Pack of 15',
    sku: 'STNY-PN-713',
    category: 'Stationery',
    price: 120,
    quantity: 40,
    reorderLevel: 20,
    supplier: 'Cello Pens',
  },
  {
    name: 'A4 Notebook 200 Pages',
    sku: 'STNY-NB-500',
    category: 'Stationery',
    price: 85,
    quantity: 12, // below reorder level → low-stock alert
    reorderLevel: 15,
    supplier: 'Classmate',
  },
  {
    name: 'Desk Organizer Tray',
    sku: 'STNY-DO-777',
    category: 'Stationery',
    price: 350,
    quantity: 6, // below reorder level → low-stock alert
    reorderLevel: 8,
    supplier: 'Invite Stationers',
  },

  /* ---------------- Furniture (2 items) ---------------- */
  {
    name: 'Study Table',
    sku: 'FURN-TB-812',
    category: 'Furniture',
    price: 3999,
    quantity: 2, // critical
    reorderLevel: 4,
    supplier: 'IKEA India',
  },
  {
    name: 'Ergonomic Office Chair',
    sku: 'FURN-OC-990',
    category: 'Furniture',
    price: 8499,
    quantity: 5,
    reorderLevel: 3,
    supplier: 'Godrej Interio',
  },

  /* ---------------- Grocery (1 item) ---------------- */
  {
    name: 'Organic Green Tea 250g',
    sku: 'GROC-GT-615',
    category: 'Grocery',
    price: 640,
    quantity: 0, // out of stock
    reorderLevel: 12,
    supplier: 'Tetley India',
  },
];

const run = async () => {
  const keep = process.argv.includes('--keep');

  try {
    await connectDB();

    if (!keep) {
      const { deletedCount } = await Product.deleteMany({});
      console.log(`Cleared ${deletedCount} existing product(s).`);
    }

    const inserted = await Product.insertMany(products);
    console.log(`Seeded ${inserted.length} products across 5 categories.\n`);

    const summary = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          items: { $sum: 1 },
          units: { $sum: '$quantity' },
          value: { $sum: { $multiply: ['$price', '$quantity'] } },
        },
      },
      { $sort: { value: -1 } },
    ]);

    console.table(
      summary.map((s) => ({
        category: s._id,
        items: s.items,
        units: s.units,
        stockValue: s.value,
      }))
    );

    const low = await Product.countDocuments({
      $expr: { $lte: ['$quantity', '$reorderLevel'] },
    });
    console.log(`Low-stock products: ${low}`);
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

run();
