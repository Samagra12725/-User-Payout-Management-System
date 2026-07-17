const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    let uri = process.env.MONGODB_URI;
    if (process.env.NODE_ENV === 'test') {
      if (uri.includes('/payout_db')) {
        uri = uri.replace('/payout_db', '/payout_db_test');
      } else {
        uri = uri.replace(/\.net\/?/, '.net/payout_db_test');
      }
    }
    const conn = await mongoose.connect(uri);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`MongoDB Connected: ${conn.connection.host}`);
    }
    return conn;
  } catch (error) {
    console.error(`Database connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
