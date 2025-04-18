// This file sets up Clerk authentication middleware for the backend
import { Request, Response, NextFunction } from 'express';

// This is a placeholder for actual Clerk middleware
// In a real implementation, you would use Clerk's SDK to verify tokens
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // For development purposes, we're allowing all requests through
  // In production, this would verify the authentication token from the request headers
  
  // Mock user data for development
  req.user = {
    id: 'mock-user-id',
    role: 'admin'
  };
  
  next();
};

// Middleware to check if user has admin role
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Unauthorized: Admin access required' });
  }
};

// Add user type to Express Request
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
      };
    }
  }
}
