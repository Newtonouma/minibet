# MiniBet - Airtel Money Testing Platform

A simple betting platform for testing Airtel Money sandbox endpoints. This application allows users to deposit and withdraw funds using Airtel Money APIs.

## Features

- User management with balance tracking
- Airtel Money integration for deposits and withdrawals
- Transaction history
- Simple betting functionality (future enhancement)

## API Endpoints

### Users
- `GET /users` - Get all users
- `GET /users/:id` - Get specific user
- `GET /users/:id/balance` - Get user balance
- `POST /users` - Create new user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

### Transactions
- `GET /transactions` - Get all transactions
- `GET /transactions?userId=:id` - Get transactions for specific user
- `GET /transactions/:id` - Get specific transaction
- `POST /transactions/deposit` - Initiate deposit
- `POST /transactions/deposit/:transactionId/process` - Process deposit via Airtel Money
- `POST /transactions/withdrawal` - Initiate withdrawal
- `POST /transactions/withdrawal/:transactionId/process` - Process withdrawal via Airtel Money

### Health Check
- `GET /health` - Application health check

## Environment Variables

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=9530
DB_DATABASE=minibet

# Application Configuration
PORT=3000
NODE_ENV=development

# Airtel Money API Configuration
AIRTEL_API_BASE_URL=https://openapiuat.airtel.africa
AIRTEL_CLIENT_ID=your_client_id
AIRTEL_CLIENT_SECRET=your_client_secret
AIRTEL_COUNTRY=KE
AIRTEL_CURRENCY=KES
AIRTEL_PIN=your_encrypted_pin
```

## Usage Examples

### Create a User
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "testuser",
    "password": "password123",
    "msisdn": "254123456789"
  }'
```

### Initiate Deposit
```bash
curl -X POST http://localhost:3000/transactions/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "amount": 100,
    "msisdn": "254123456789",
    "description": "Deposit to betting account"
  }'
```

### Process Deposit (Airtel Money Collection)
```bash
curl -X POST http://localhost:3000/transactions/deposit/TXN123456/process
```

### Initiate Withdrawal
```bash
curl -X POST http://localhost:3000/transactions/withdrawal \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "amount": 50,
    "msisdn": "254123456789",
    "description": "Withdrawal from betting account"
  }'
```

### Process Withdrawal (Airtel Money Disbursement)
```bash
curl -X POST http://localhost:3000/transactions/withdrawal/TXN123456/process
```

## Database Schema

### Users Table
- `id` - Primary key
- `email` - Unique email address
- `username` - Username
- `password` - Password (should be hashed in production)
- `msisdn` - Phone number for Airtel Money
- `balance` - Current account balance
- `isActive` - Account status
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

### Transactions Table
- `id` - Primary key
- `transactionId` - Unique transaction identifier
- `type` - Transaction type (deposit, withdrawal, bet, winning)
- `status` - Transaction status (pending, completed, failed, processing)
- `amount` - Transaction amount
- `currency` - Currency (KES)
- `reference` - Transaction reference
- `msisdn` - Phone number
- `airtelMoneyId` - Airtel Money transaction ID
- `airtelReferenceId` - Airtel reference ID
- `description` - Transaction description
- `userId` - Foreign key to users table
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

## Getting Started

1. Install dependencies: `npm install`
2. Set up PostgreSQL database
3. Configure environment variables
4. Run the application: `npm run start:dev`

## Airtel Money Integration

The application integrates with Airtel Money sandbox APIs:

1. **Authentication** - Gets OAuth2 token using client credentials
2. **Payment Collection** - Collects payments from customers
3. **Disbursement** - Sends money to customers

The tokens are automatically refreshed when needed.
