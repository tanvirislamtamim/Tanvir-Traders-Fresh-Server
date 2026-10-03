import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { connectDB } from './config/db.js';
import productRoutes from './routes/productRoutes.js';
import dailySaleRoutes from './routes/dailySaleRoutes.js';
import stockInwardRoutes from './routes/stockInwardRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import userRoutes from './routes/userRoutes.js';
import pendingRoutes from './routes/pendingRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Connect to MongoDB
connectDB();

// Middlewares
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/daily-sales', dailySaleRoutes);
app.use('/api/stock-inward', stockInwardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pending', pendingRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    dealership: 'Tanvir Traders',
    company: 'Meghna Beverage Ltd - Fresh',
    timestamp: new Date().toISOString(),
  });
});
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Tanvir Traders - Meghna Beverage Ltd (Fresh) Backend is running",
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  TANVIR TRADERS - MEGHNA BEVERAGE LTD (FRESH) DEALERSHIP   `);
  console.log(`  Backend server running on http://localhost:${PORT}`);
  console.log(`====================================================`);
});

export default app;
