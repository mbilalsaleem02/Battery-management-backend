# Database Schema Documentation for Battery Manager

## Overview
This document outlines the database schema design for the Battery Manager application, a full-stack system for managing battery rentals, inventory, customers, and payments.

## Models

### User
Handles authentication and access control for the application.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key, auto-generated |
| email | String | Unique email for login |
| name | String | User's full name |
| role | Enum (ADMIN, STAFF) | Access level |
| createdAt | DateTime | When record was created |
| updatedAt | DateTime | When record was last updated |

### Battery
Manages the inventory of batteries available for rental.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key, auto-generated |
| serialNumber | String | Unique identifier for the battery |
| price | Decimal | Cost of the battery |
| dateAdded | DateTime | When battery was added to inventory |
| status | Enum (AVAILABLE, RENTED, MAINTENANCE) | Current status |
| createdAt | DateTime | When record was created |
| updatedAt | DateTime | When record was last updated |

### Customer
Stores information about customers who rent batteries.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key, auto-generated |
| name | String | Customer's full name |
| phoneNumber | String | Unique contact number |
| address | String | Customer's address/location |
| creditRating | Integer | Rating from 0-5 stars |
| createdAt | DateTime | When record was created |
| updatedAt | DateTime | When record was last updated |

### Rental
Tracks the rental transactions between customers and batteries.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key, auto-generated |
| batteryId | UUID | Foreign key to Battery |
| customerId | UUID | Foreign key to Customer |
| rentDate | DateTime | When battery was rented |
| returnDate | DateTime (optional) | When battery was returned |
| rentalPrice | Decimal | Price charged for rental |
| isPaid | Boolean | Payment status |
| createdAt | DateTime | When record was created |
| updatedAt | DateTime | When record was last updated |

### Payment
Records payment transactions related to rentals.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key, auto-generated |
| rentalId | UUID | Foreign key to Rental |
| customerId | UUID | Foreign key to Customer |
| amount | Decimal | Payment amount |
| paymentDate | DateTime | When payment was made |
| paymentMethod | Enum (CASH, MOBILE_MONEY, BANK_TRANSFER) | Method of payment |
| createdAt | DateTime | When record was created |
| updatedAt | DateTime | When record was last updated |

## Relationships

- A **Battery** can have multiple **Rentals** (one-to-many)
- A **Customer** can have multiple **Rentals** (one-to-many)
- A **Customer** can have multiple **Payments** (one-to-many)
- A **Rental** can have multiple **Payments** (one-to-many)
- A **Rental** belongs to one **Battery** and one **Customer** (many-to-one)
- A **Payment** belongs to one **Rental** and one **Customer** (many-to-one)

## Enums

### Role
- ADMIN: Full access to all features
- STAFF: Limited access based on permissions

### Status
- AVAILABLE: Battery is in stock and can be rented
- RENTED: Battery is currently with a customer
- MAINTENANCE: Battery is being repaired or maintained

### PaymentMethod
- CASH: Physical currency payment
- MOBILE_MONEY: Payment via mobile money services
- BANK_TRANSFER: Payment via bank transfer

## Notes
- Credit rating is automatically calculated based on payment history and return timeliness
- All financial fields use Decimal type to ensure precision in calculations
- UUID is used for all IDs to ensure uniqueness across the system
