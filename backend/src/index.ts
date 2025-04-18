import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Import routes
import inventoryRoutes from './routes/inventory';
import customerRoutes from './routes/customers';
import rentalRoutes from './routes/rentals';
import paymentRoutes from './routes/payments';
import userRoutes from './routes/users';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/inventory', inventoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Battery Manager API' });
});

// Dashboard summary route
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    // Get inventory stats
    const totalBatteries = await prisma.battery.count();
    const availableBatteries = await prisma.battery.count({
      where: { status: 'AVAILABLE' }
    });
    const rentedBatteries = await prisma.battery.count({
      where: { status: 'RENTED' }
    });

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get end of day
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Get earnings for today
    const todayPayments = await prisma.payment.findMany({
      where: {
        paymentDate: {
          gte: today,
          lte: endOfDay
        }
      }
    });
    const earnedToday = todayPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    // Get total due across customers
    const unpaidRentals = await prisma.rental.findMany({
      where: {
        isPaid: false
      },
      include: {
        payments: true
      }
    });

    let totalDue = 0;
    unpaidRentals.forEach(rental => {
      const paidAmount = rental.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      totalDue += Number(rental.rentalPrice) - paidAmount;
    });

    // Get top 5 customers by rental count
    const customers = await prisma.customer.findMany({
      include: {
        _count: {
          select: { rentals: true }
        }
      }
    });

    const topCustomers = customers
      .sort((a, b) => b._count.rentals - a._count.rentals)
      .slice(0, 5)
      .map(customer => ({
        id: customer.id,
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        rentalCount: customer._count.rentals,
        creditRating: customer.creditRating
      }));

    // Get 5 worst credit ratings
    const worstCreditRatings = customers
      .sort((a, b) => a.creditRating - b.creditRating)
      .slice(0, 5)
      .map(customer => ({
        id: customer.id,
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        creditRating: customer.creditRating
      }));

    res.json({
      inventory: {
        total: totalBatteries,
        available: availableBatteries,
        rented: rentedBatteries
      },
      financial: {
        earnedToday,
        totalDue
      },
      customers: {
        topRenters: topCustomers,
        worstCreditRatings
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  console.log('Disconnected from database');
  process.exit(0);
});
