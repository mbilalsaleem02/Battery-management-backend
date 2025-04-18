import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all batteries
router.get('/', requireAuth, async (req, res) => {
  try {
    const batteries = await prisma.battery.findMany({
      orderBy: {
        dateAdded: 'desc'
      }
    });
    res.json(batteries);
  } catch (error) {
    console.error('Error fetching batteries:', error);
    res.status(500).json({ error: 'Failed to fetch batteries' });
  }
});

// Get a single battery by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const battery = await prisma.battery.findUnique({
      where: { id },
      include: {
        rentals: {
          include: {
            customer: true
          },
          orderBy: {
            rentDate: 'desc'
          }
        }
      }
    });

    if (!battery) {
      return res.status(404).json({ error: 'Battery not found' });
    }

    res.json(battery);
  } catch (error) {
    console.error('Error fetching battery:', error);
    res.status(500).json({ error: 'Failed to fetch battery' });
  }
});

// Add a new battery
router.post('/', requireAuth, async (req, res) => {
  try {
    const { serialNumber, price } = req.body;

    // Validate required fields
    if (!serialNumber || !price) {
      return res.status(400).json({ error: 'Serial number and price are required' });
    }

    // Check if battery with serial number already exists
    const existingBattery = await prisma.battery.findUnique({
      where: { serialNumber }
    });

    if (existingBattery) {
      return res.status(400).json({ error: 'Battery with this serial number already exists' });
    }

    const newBattery = await prisma.battery.create({
      data: {
        serialNumber,
        price: parseFloat(price),
        status: 'AVAILABLE'
      }
    });

    res.status(201).json(newBattery);
  } catch (error) {
    console.error('Error creating battery:', error);
    res.status(500).json({ error: 'Failed to create battery' });
  }
});

// Update a battery
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { serialNumber, price, status } = req.body;

    // Check if battery exists
    const existingBattery = await prisma.battery.findUnique({
      where: { id }
    });

    if (!existingBattery) {
      return res.status(404).json({ error: 'Battery not found' });
    }

    // If serial number is being changed, check if it's unique
    if (serialNumber && serialNumber !== existingBattery.serialNumber) {
      const duplicateSerial = await prisma.battery.findUnique({
        where: { serialNumber }
      });

      if (duplicateSerial) {
        return res.status(400).json({ error: 'Battery with this serial number already exists' });
      }
    }

    const updatedBattery = await prisma.battery.update({
      where: { id },
      data: {
        ...(serialNumber && { serialNumber }),
        ...(price && { price: parseFloat(price) }),
        ...(status && { status })
      }
    });

    res.json(updatedBattery);
  } catch (error) {
    console.error('Error updating battery:', error);
    res.status(500).json({ error: 'Failed to update battery' });
  }
});

// Delete a battery
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if battery exists
    const existingBattery = await prisma.battery.findUnique({
      where: { id },
      include: {
        rentals: true
      }
    });

    if (!existingBattery) {
      return res.status(404).json({ error: 'Battery not found' });
    }

    // Check if battery has any rentals
    if (existingBattery.rentals.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete battery with rental history. Consider marking it as MAINTENANCE instead.' 
      });
    }

    await prisma.battery.delete({
      where: { id }
    });

    res.json({ message: 'Battery deleted successfully' });
  } catch (error) {
    console.error('Error deleting battery:', error);
    res.status(500).json({ error: 'Failed to delete battery' });
  }
});

// Get inventory summary
router.get('/summary/stats', requireAuth, async (req, res) => {
  try {
    const totalBatteries = await prisma.battery.count();
    const availableBatteries = await prisma.battery.count({
      where: { status: 'AVAILABLE' }
    });
    const rentedBatteries = await prisma.battery.count({
      where: { status: 'RENTED' }
    });
    const maintenanceBatteries = await prisma.battery.count({
      where: { status: 'MAINTENANCE' }
    });

    res.json({
      total: totalBatteries,
      available: availableBatteries,
      rented: rentedBatteries,
      maintenance: maintenanceBatteries
    });
  } catch (error) {
    console.error('Error fetching inventory summary:', error);
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

export default router;
