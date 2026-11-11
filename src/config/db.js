const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the URI from .env (dotenv is loaded in server.js).
 * Fails fast with a readable message if the database is unreachable.
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is not defined. Add it to your .env file.');
  }

  mongoose.set('strictQuery', true);

  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log(`MongoDB connected → ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });

  return conn;
};

module.exports = connectDB;
