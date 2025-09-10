# Test the MiniBet API

# 1. Test Health Endpoint
Write-Host "Testing Health Endpoint..."
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -Method Get
    Write-Host "Health Response:" -ForegroundColor Green
    $health | ConvertTo-Json
} catch {
    Write-Host "Health test failed: $_" -ForegroundColor Red
}

Write-Host "`n" + "="*50 + "`n"

# 2. Create a Test User
Write-Host "Creating a test user..."
$userData = @{
    email = "test@minibet.com"
    username = "testuser"
    password = "password123"
    msisdn = "254123456789"
} | ConvertTo-Json

try {
    $user = Invoke-RestMethod -Uri "http://127.0.0.1:3000/users" -Method Post -Body $userData -ContentType "application/json"
    Write-Host "User created successfully:" -ForegroundColor Green
    $user | ConvertTo-Json
    $userId = $user.id
} catch {
    Write-Host "User creation failed: $_" -ForegroundColor Red
    exit
}

Write-Host "`n" + "="*50 + "`n"

# 3. Check User Balance
Write-Host "Checking user balance..."
try {
    $balance = Invoke-RestMethod -Uri "http://127.0.0.1:3000/users/$userId/balance" -Method Get
    Write-Host "User balance:" -ForegroundColor Green
    $balance | ConvertTo-Json
} catch {
    Write-Host "Balance check failed: $_" -ForegroundColor Red
}

Write-Host "`n" + "="*50 + "`n"

# 4. Create a Deposit Transaction
Write-Host "Creating a deposit transaction..."
$depositData = @{
    userId = $userId
    amount = 100
    msisdn = "254123456789"
    description = "Test deposit"
} | ConvertTo-Json

try {
    $deposit = Invoke-RestMethod -Uri "http://127.0.0.1:3000/transactions/deposit" -Method Post -Body $depositData -ContentType "application/json"
    Write-Host "Deposit transaction created:" -ForegroundColor Green
    $deposit | ConvertTo-Json
    $transactionId = $deposit.transactionId
} catch {
    Write-Host "Deposit creation failed: $_" -ForegroundColor Red
}

Write-Host "`n" + "="*50 + "`n"

# 5. Get All Transactions
Write-Host "Getting all transactions..."
try {
    $transactions = Invoke-RestMethod -Uri "http://127.0.0.1:3000/transactions" -Method Get
    Write-Host "All transactions:" -ForegroundColor Green
    $transactions | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Getting transactions failed: $_" -ForegroundColor Red
}

Write-Host "`n" + "="*50 + "`n"

# 6. Get User Transactions
Write-Host "Getting user transactions..."
try {
    $userTransactions = Invoke-RestMethod -Uri "http://127.0.0.1:3000/transactions?userId=$userId" -Method Get
    Write-Host "User transactions:" -ForegroundColor Green
    $userTransactions | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Getting user transactions failed: $_" -ForegroundColor Red
}

Write-Host "`n" + "="*50 + "`n"

Write-Host "API testing completed!" -ForegroundColor Yellow
Write-Host "Note: Airtel Money processing endpoints require valid API credentials and won't work in sandbox without proper setup." -ForegroundColor Yellow
