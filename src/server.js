const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

// Connect to Database and start Server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
