import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all rentals
router.get('/', requireAuth, async (req, res) => {
  try {
    const rentals = await prisma.rental.findMany({
      include: {
        battery: true,
        customer: true,
        payments: true
      },
      orderBy: {
        rentDate: 'desc'
      }
    });
    res.json(rentals);
  } catch (error) {
    console.error('Error fetching rentals:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

// Get a single rental by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const rental = await prisma.rental.findUnique({
      where: { id },
      include: {
        battery: true,
        customer: true,
        payments: true
      }
    });

    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    // Calculate remaining balance
    const totalPaid = rental.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const remainingBalance = Number(rental.rentalPrice) - totalPaid;

    const rentalWithBalance = {
      ...rental,
      remainingBalance
    };

    res.json(rentalWithBalance);
  } catch (error) {
    console.error('Error fetching rental:', error);
    res.status(500).json({ error: 'Failed to fetch rental' });
  }
});

// Create a new rental (rent a battery)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { batteryId, customerId, rentalPrice, isPaid } = req.body;

    // Validate required fields
    if (!batteryId || !customerId || !rentalPrice) {
      return res.status(400).json({ error: 'Battery ID, customer ID, and rental price are required' });
    }

    // Check if battery exists and is available
    const battery = await prisma.battery.findUnique({
      where: { id: batteryId }
    });

    if (!battery) {
      return res.status(404).json({ error: 'Battery not found' });
    }

    if (battery.status !== 'AVAILABLE') {
      return res.status(400).json({ error: 'Battery is not available for rent' });
    }

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Create rental and update battery status in a transaction
    const result = await prisma.$transaction(async (prisma) => {
      // Create the rental
      const rental = await prisma.rental.create({
        data: {
          batteryId,
          customerId,
          rentalPrice: parseFloat(rentalPrice),
          isPaid: isPaid || false
        }
      });

      // Update battery status to RENTED
      await prisma.battery.update({
        where: { id: batteryId },
        data: { status: 'RENTED' }
      });

      return rental;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating rental:', error);
    res.status(500).json({ error: 'Failed to create rental' });
  }
});

// Return a battery
router.put('/:id/return', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { returnDate, isPaid } = req.body;

    // Check if rental exists
    const rental = await prisma.rental.findUnique({
      where: { id },
      include: { battery: true }
    });

    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    if (rental.returnDate) {
      return res.status(400).json({ error: 'Battery has already been returned' });
    }

    // Process return and update battery status in a transaction
    const result = await prisma.$transaction(async (prisma) => {
      // Update the rental
      const updatedRental = await prisma.rental.update({
        where: { id },
        data: {
          returnDate: returnDate ? new Date(returnDate) : new Date(),
          isPaid: isPaid !== undefined ? isPaid : rental.isPaid
        }
      });

      // Update battery status to AVAILABLE
      await prisma.battery.update({
        where: { id: rental.batteryId },
        data: { status: 'AVAILABLE' }
      });

      return updatedRental;
    });

    // Update customer credit rating based on return and payment
    await updateCustomerCreditRating(rental.customerId);

    res.json(result);
  } catch (error) {
    console.error('Error returning battery:', error);
    res.status(500).json({ error: 'Failed to return battery' });
  }
});

// Update rental payment status
router.put('/:id/payment', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPaid } = req.body;

    if (isPaid === undefined) {
      return res.status(400).json({ error: 'Payment status is required' });
    }

    // Check if rental exists
    const rental = await prisma.rental.findUnique({
      where: { id }
    });

    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const updatedRental = await prisma.rental.update({
      where: { id },
      data: { isPaid }
    });

    // Update customer credit rating based on payment
    await updateCustomerCreditRating(rental.customerId);

    res.json(updatedRental);
  } catch (error) {
    console.error('Error updating rental payment status:', error);
    res.status(500).json({ error: 'Failed to update rental payment status' });
  }
});

// Get active rentals (not returned)
router.get('/filter/active', requireAuth, async (req, res) => {
  try {
    const activeRentals = await prisma.rental.findMany({
      where: {
        returnDate: null
      },
      include: {
        battery: true,
        customer: true
      },
      orderBy: {
        rentDate: 'desc'
      }
    });

    res.json(activeRentals);
  } catch (error) {
    console.error('Error fetching active rentals:', error);
    res.status(500).json({ error: 'Failed to fetch active rentals' });
  }
});

// Get rentals by date range
router.get('/filter/by-date', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const rentals = await prisma.rental.findMany({
      where: {
        rentDate: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string)
        }
      },
      include: {
        battery: true,
        customer: true,
        payments: true
      },
      orderBy: {
        rentDate: 'desc'
      }
    });

    res.json(rentals);
  } catch (error) {
    console.error('Error fetching rentals by date:', error);
    res.status(500).json({ error: 'Failed to fetch rentals by date' });
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
