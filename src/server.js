require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`API listening → http://localhost:${PORT}/api/products`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    /* ---- graceful shutdown ---- */
    const shutdown = async (signal) => {
      console.log(`\n${signal} received — shutting down gracefully...`);
      server.close(async () => {
        await mongoose.connection.close();
        console.log('HTTP server and MongoDB connection closed.');
        process.exit(0);
      });
    };

    ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
  } catch (err) {
    console.error('Failed to start the server:', err.message);
    process.exit(1);
  }
};

start();
