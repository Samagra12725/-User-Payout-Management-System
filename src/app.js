const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
const userRoutes = require('./routes/userRoutes');
const saleRoutes = require('./routes/saleRoutes');
const payoutRoutes = require('./routes/payoutRoutes');

app.use('/api/users', userRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/payouts', payoutRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Fallback 404 handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

module.exports = app;
