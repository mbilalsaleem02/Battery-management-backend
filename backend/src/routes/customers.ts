import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all customers
router.get('/', requireAuth, async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: {
        name: 'asc'
      }
    });
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get a single customer by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        rentals: {
          include: {
            battery: true,
            payments: true
          },
          orderBy: {
            rentDate: 'desc'
          }
        },
        payments: {
          orderBy: {
            paymentDate: 'desc'
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Calculate due balance
    let dueBalance = 0;
    customer.rentals.forEach(rental => {
      if (!rental.isPaid) {
        dueBalance += Number(rental.rentalPrice);
        // Subtract any partial payments
        const paidAmount = rental.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        dueBalance -= paidAmount;
      }
    });

    // Add customer profile data
    const customerProfile = {
      ...customer,
      dueBalance
    };

    res.json(customerProfile);
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Add a new customer
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, phoneNumber, address } = req.body;

    // Validate required fields
    if (!name || !phoneNumber) {
      return res.status(400).json({ error: 'Name and phone number are required' });
    }

    // Check if customer with phone number already exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { phoneNumber }
    });

    if (existingCustomer) {
      return res.status(400).json({ error: 'Customer with this phone number already exists' });
    }

    const newCustomer = await prisma.customer.create({
      data: {
        name,
        phoneNumber,
        address: address || '',
        creditRating: 3 // Default credit rating
      }
    });

    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update a customer
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phoneNumber, address, creditRating } = req.body;

    // Check if customer exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { id }
    });

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // If phone number is being changed, check if it's unique
    if (phoneNumber && phoneNumber !== existingCustomer.phoneNumber) {
      const duplicatePhone = await prisma.customer.findUnique({
        where: { phoneNumber }
      });

      if (duplicatePhone) {
        return res.status(400).json({ error: 'Customer with this phone number already exists' });
      }
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(phoneNumber && { phoneNumber }),
        ...(address !== undefined && { address }),
        ...(creditRating !== undefined && { creditRating: parseInt(creditRating) })
      }
    });

    res.json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Delete a customer
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { id },
      include: {
        rentals: true,
        payments: true
      }
    });

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if customer has any rentals or payments
    if (existingCustomer.rentals.length > 0 || existingCustomer.payments.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete customer with rental or payment history.' 
      });
    }

    await prisma.customer.delete({
      where: { id }
    });

    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Get customers with due balance
router.get('/filter/with-dues', requireAuth, async (req, res) => {
  try {
    // Get all customers with their rentals and payments
    const customers = await prisma.customer.findMany({
      include: {
        rentals: {
          where: {
            isPaid: false
          },
          include: {
            payments: true
          }
        }
      }
    });

    // Filter customers with unpaid rentals and calculate due amounts
    const customersWithDues = customers
      .map(customer => {
        let dueAmount = 0;
        
        customer.rentals.forEach(rental => {
          const paidAmount = rental.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
          dueAmount += Number(rental.rentalPrice) - paidAmount;
        });
        
        return {
          id: customer.id,
          name: customer.name,
          phoneNumber: customer.phoneNumber,
          creditRating: customer.creditRating,
          dueAmount
        };
      })
      .filter(customer => customer.dueAmount > 0)
      .sort((a, b) => b.dueAmount - a.dueAmount);

    res.json(customersWithDues);
  } catch (error) {
    console.error('Error fetching customers with dues:', error);
    res.status(500).json({ error: 'Failed to fetch customers with dues' });
  }
});

// Get top customers by rental count
router.get('/top/by-rentals', requireAuth, async (req, res) => {
  try {
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

    res.json(topCustomers);
  } catch (error) {
    console.error('Error fetching top customers:', error);
    res.status(500).json({ error: 'Failed to fetch top customers' });
  }
});

export default router;
