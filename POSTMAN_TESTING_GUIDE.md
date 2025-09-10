# Postman Testing Guide for MiniBet API

## Prerequisites
1. Start the NestJS application: `npm run start:dev`
2. Ensure the app is running on `http://localhost:3000` or `http://127.0.0.1:3000`
3. Make sure PostgreSQL is running and tables are created

## Important: Transaction Status Handling
The system now processes Airtel Money responses immediately:
- **Success Response (`success: true`, `status: "TS"`)**: Transaction marked as `COMPLETED`, balance updated
- **Failed Response (`success: false` or `status: "TF"`)**: Transaction marked as `FAILED`, balance unchanged
- **Processing Response (other statuses)**: Transaction marked as `PROCESSING`, balance unchanged

## Base URL
```
http://localhost:3000
```

## Testing Endpoints in Order

### 1. Health Check
**Method:** GET  
**URL:** `http://localhost:3000/health`  
**Description:** Verify the API is running  

**Expected Response:**
```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    }
  }
}
```

---

### 2. Create a User
**Method:** POST  
**URL:** `http://localhost:3000/users`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "email": "john.doe@example.com",
  "username": "johndoe",
  "password": "password123",
  "msisdn": "254712345678"
}
```

**Expected Response:**
```json
{
  "id": 1,
  "email": "john.doe@example.com",
  "username": "johndoe",
  "msisdn": "254712345678",
  "balance": "0.00",
  "createdAt": "2025-09-10T05:30:00.000Z",
  "updatedAt": "2025-09-10T05:30:00.000Z"
}
```

**Note:** Save the user `id` from the response for subsequent requests.

---

### 3. Get User Balance
**Method:** GET  
**URL:** `http://localhost:3000/users/{userId}/balance`  
**Example:** `http://localhost:3000/users/1/balance`

**Expected Response:**
```json
{
  "userId": 1,
  "balance": "0.00"
}
```

---

### 4. Create a Deposit Transaction
**Method:** POST  
**URL:** `http://localhost:3000/transactions/deposit`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "userId": 1,
  "amount": 100.00,
  "msisdn": "254712345678",
  "description": "Deposit to wallet"
}
```

**Expected Response:**
```json
{
  "id": 1,
  "transactionId": "DEP_xxxxxxxxxx",
  "type": "deposit",
  "status": "pending",
  "amount": "100.00",
  "currency": "KES",
  "msisdn": "254712345678",
  "description": "Deposit to wallet",
  "userId": 1,
  "createdAt": "2025-09-10T05:35:00.000Z",
  "updatedAt": "2025-09-10T05:35:00.000Z"
}
```

**Note:** Save the `transactionId` for processing the transaction.

---

### 5. Process Deposit Transaction
**Method:** POST  
**URL:** `http://localhost:3000/transactions/deposit/{transactionId}/process`  
**Example:** `http://localhost:3000/transactions/deposit/DEP_xxxxxxxxxx/process`

**Expected Response (if Airtel Money returns success):**
```json
{
  "message": "Deposit transaction processed successfully",
  "transaction": {
    "id": 1,
    "transactionId": "DEP_xxxxxxxxxx",
    "type": "deposit",
    "status": "completed",
    "amount": "100.00",
    "currency": "KES",
    "airtelMoneyId": "disbursement-XFMOJ26M4M-DEP_xxxxxxxxxx",
    "airtelReferenceId": "10000280410"
  }
}
```

**Note:** The transaction status will be:
- `completed` if Airtel Money returns `success: true` and `status: "TS"`
- `failed` if Airtel Money returns `success: false` or `status: "TF"`
- `processing` for other status codes

---

### 6. Verify Updated Balance
**Method:** GET  
**URL:** `http://localhost:3000/users/1/balance`

**Expected Response:**
```json
{
  "userId": 1,
  "balance": "100.00"
}
```

---

### 7. Create a Withdrawal Transaction
**Method:** POST  
**URL:** `http://localhost:3000/transactions/withdrawal`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "userId": 1,
  "amount": 50.00,
  "msisdn": "254712345678",
  "description": "Withdrawal from wallet"
}
```

**Expected Response:**
```json
{
  "id": 2,
  "transactionId": "WTH_xxxxxxxxxx",
  "type": "withdrawal",
  "status": "pending",
  "amount": "50.00",
  "currency": "KES",
  "msisdn": "254712345678",
  "description": "Withdrawal from wallet",
  "userId": 1,
  "createdAt": "2025-09-10T05:40:00.000Z",
  "updatedAt": "2025-09-10T05:40:00.000Z"
}
```

---

### 8. Process Withdrawal Transaction
**Method:** POST  
**URL:** `http://localhost:3000/transactions/withdrawal/{transactionId}/process`  
**Example:** `http://localhost:3000/transactions/withdrawal/WTH_xxxxxxxxxx/process`

**Expected Response:**
```json
{
  "message": "Withdrawal transaction processed successfully",
  "transaction": {
    "id": 2,
    "transactionId": "WTH_xxxxxxxxxx",
    "type": "withdrawal",
    "status": "completed",
    "amount": "50.00",
    "currency": "KES",
    "airtelTransactionId": "AP_xxxxxxxxxx"
  }
}
```

---

### 9. Get All Transactions
**Method:** GET  
**URL:** `http://localhost:3000/transactions`

**Expected Response:**
```json
[
  {
    "id": 1,
    "transactionId": "DEP_xxxxxxxxxx",
    "type": "deposit",
    "status": "completed",
    "amount": "100.00",
    "currency": "KES",
    "createdAt": "2025-09-10T05:35:00.000Z"
  },
  {
    "id": 2,
    "transactionId": "WTH_xxxxxxxxxx",
    "type": "withdrawal",
    "status": "completed",
    "amount": "50.00",
    "currency": "KES",
    "createdAt": "2025-09-10T05:40:00.000Z"
  }
]
```

---

### 10. Get User-Specific Transactions
**Method:** GET  
**URL:** `http://localhost:3000/transactions?userId=1`

**Expected Response:**
```json
[
  {
    "id": 1,
    "transactionId": "DEP_xxxxxxxxxx",
    "type": "deposit",
    "status": "completed",
    "amount": "100.00",
    "userId": 1
  },
  {
    "id": 2,
    "transactionId": "WTH_xxxxxxxxxx",
    "type": "withdrawal",
    "status": "completed",
    "amount": "50.00",
    "userId": 1
  }
]
```

---

### 11. Get Specific Transaction
**Method:** GET  
**URL:** `http://localhost:3000/transactions/{transactionId}`  
**Example:** `http://localhost:3000/transactions/1`

**Expected Response:**
```json
{
  "id": 1,
  "transactionId": "DEP_xxxxxxxxxx",
  "type": "deposit",
  "status": "completed",
  "amount": "100.00",
  "currency": "KES",
  "msisdn": "254712345678",
  "description": "Deposit to wallet",
  "userId": 1,
  "createdAt": "2025-09-10T05:35:00.000Z",
  "updatedAt": "2025-09-10T05:35:00.000Z"
}
```

---

## Setting up Postman Collection

### Option 1: Manual Setup
1. Create a new Collection in Postman called "MiniBet API"
2. Create each request as described above
3. Set up environment variables:
   - `base_url`: `http://localhost:3000`
   - `user_id`: (set after creating a user)
   - `transaction_id`: (set after creating a transaction)

### Option 2: Import Collection
I can create a Postman collection file for you. Would you like me to create that?

## Common Error Scenarios to Test

### 1. Invalid User ID
- Try using a non-existent user ID in any user-related endpoint
- **Expected:** 404 Not Found

### 2. Insufficient Balance
- Try withdrawing more money than the user's balance
- **Expected:** 400 Bad Request with error message

### 3. Invalid Transaction Data
- Send incomplete or invalid JSON data
- **Expected:** 400 Bad Request with validation errors

### 4. Non-existent Transaction
- Try processing a transaction that doesn't exist
- **Expected:** 404 Not Found

## Tips for Postman Testing

1. **Use Environment Variables:** Set up variables for base URL, user IDs, and transaction IDs
2. **Test Scripts:** Add test scripts to automatically extract values from responses
3. **Collection Runner:** Use Postman's Collection Runner to test all endpoints in sequence
4. **Pre-request Scripts:** Set up dynamic data generation for unique emails, etc.

## Example Test Script for Postman
Add this to the "Tests" tab of your user creation request:
```javascript
pm.test("Status code is 201", function () {
    pm.response.to.have.status(201);
});

pm.test("Response has user id", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('id');
    // Save user ID for other requests
    pm.environment.set("user_id", jsonData.id);
});
```

This will automatically save the user ID for use in subsequent requests.
