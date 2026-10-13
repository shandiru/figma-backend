const mongoose = require('mongoose');
const cfg = require('./config');

// Serverless-friendly cached connection (reused between warm invocations)
const cache = global._mongoCache || (global._mongoCache = { conn: null, promise: null });

async function connect() {
  const uri = cfg.MONGODB_URI;
  if (!uri) return null; // DB is optional
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 5000 });
  }
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }
  return cache.conn;
}

module.exports = { connect, enabled: () => !!cfg.MONGODB_URI };
