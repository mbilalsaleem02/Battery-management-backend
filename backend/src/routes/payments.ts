import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all payments
router.get('/', requireAuth, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        rental: true,
        customer: true
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Get a single payment by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        rental: {
          include: {
            battery: true
          }
        },
        customer: true
      }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// Create a new payment
router.post('/', requireAuth, async (req, res) => {
  try {
    const { rentalId, customerId, amount, paymentMethod } = req.body;

    // Validate required fields
    if (!rentalId || !customerId || !amount || !paymentMethod) {
      return res.status(400).json({ error: 'Rental ID, customer ID, amount, and payment method are required' });
    }

    // Check if rental exists
    const rental = await prisma.rental.findUnique({
      where: { id: rentalId },
      include: {
        payments: true
      }
    });

    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if customer matches the rental
    if (rental.customerId !== customerId) {
      return res.status(400).json({ error: 'Customer ID does not match the rental' });
    }

    // Calculate total paid amount including this payment
    const totalPaidSoFar = rental.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const newTotalPaid = totalPaidSoFar + Number(amount);
    const rentalPrice = Number(rental.rentalPrice);

    // Create payment and update rental payment status if fully paid
    const result = await prisma.$transaction(async (prisma) => {
      // Create the payment
      const payment = await prisma.payment.create({
        data: {
          rentalId,
          customerId,
          amount: parseFloat(amount),
          paymentMethod
        }
      });

      // Update rental payment status if fully paid
      if (newTotalPaid >= rentalPrice) {
        await prisma.rental.update({
          where: { id: rentalId },
          data: { isPaid: true }
        });
      }

      return payment;
    });

    // Update customer credit rating based on payment
    await updateCustomerCreditRating(customerId);

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Get payments by date range
router.get('/filter/by-date', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const payments = await prisma.payment.findMany({
      where: {
        paymentDate: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string)
        }
      },
      include: {
        rental: true,
        customer: true
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });

    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments by date:', error);
    res.status(500).json({ error: 'Failed to fetch payments by date' });
  }
});

// Get daily earnings
router.get('/summary/daily', requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date as string) : new Date();
    
    // Set time to start of day
    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);
    
    // Set time to end of day
    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    const payments = await prisma.payment.findMany({
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    const totalEarned = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    res.json({ date: targetDate, totalEarned });
  } catch (error) {
    console.error('Error fetching daily earnings:', error);
    res.status(500).json({ error: 'Failed to fetch daily earnings' });
  }
});

// Get monthly earnings
router.get('/summary/monthly', requireAuth, async (req, res) => {
  try {
    const { year, month } = req.query;
    
    const now = new Date();
    const targetYear = year ? parseInt(year as string) : now.getFullYear();
    const targetMonth = month ? parseInt(month as string) - 1 : now.getMonth(); // JS months are 0-indexed
    
    // Start of month
    const startDate = new Date(targetYear, targetMonth, 1);
    
    // End of month
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    const payments = await prisma.payment.findMany({
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    const totalEarned = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    res.json({ 
      year: targetYear, 
      month: targetMonth + 1, 
      totalEarned 
    });
  } catch (error) {
    console.error('Error fetching monthly earnings:', error);
    res.status(500).json({ error: 'Failed to fetch monthly earnings' });
  }
});

// Get financial summary
router.get('/summary/financial', requireAuth, async (req, res) => {
  try {
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get start of current month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
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

    // Get earnings for current month
    const monthPayments = await prisma.payment.findMany({
      where: {
        paymentDate: {
          gte: startOfMonth,
          lte: endOfDay
        }
      }
    });
    const earnedThisMonth = monthPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);

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

    res.json({
      earnedToday,
      earnedThisMonth,
      totalDue
    });
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
});

// Helper function to update customer credit rating
async function updateCustomerCreditRating(customerId: string) {
  try {
    // Get all rentals for the customer
    const customerRentals = await prisma.rental.findMany({
      where: { customerId },
      include: { payments: true }
    });

    // Calculate credit rating based on payment history and return timeliness
    let totalPoints = 0;
    let totalRentals = customerRentals.length;

    if (totalRentals === 0) return;

    customerRentals.forEach(rental => {
      // Points for payment (0-2)
      if (rental.isPaid) {
        totalPoints += 2;
      } else if (rental.payments.length > 0) {
        // Partial payment
        totalPoints += 1;
      }

      // Points for timely return (0-1)
      if (rental.returnDate) {
        const rentDuration = Math.floor((new Date(rental.returnDate).getTime() - new Date(rental.rentDate).getTime()) / (1000 * 60 * 60 * 24));
        // Assuming a standard rental period of 7 days
        if (rentDuration <= 7) {
          totalPoints += 1;
        }
      }
    });

    // Calculate average points (0-3) and scale to 0-5 rating
    const avgPoints = totalPoints / (totalRentals * 3);
    const creditRating = Math.round(avgPoints * 5);

    // Update customer credit rating
    await prisma.customer.update({
      where: { id: customerId },
      data: { creditRating }
    });
  } catch (error) {
    console.error('Error updating customer credit rating:', error);
  }
}

export default router;
