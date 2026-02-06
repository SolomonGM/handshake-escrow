# Test Authentication Endpoints
# Run this script in PowerShell to test registration and login

Write-Host "`n🧪 Testing Authentication System..." -ForegroundColor Cyan

# Test 1: Register a new user
Write-Host "`n1️⃣  Testing Registration..." -ForegroundColor Yellow
$registerBody = @{
    username = "testuser"
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod -Uri "http://localhost:5001/api/auth/register" `
        -Method POST `
        -Body $registerBody `
        -ContentType "application/json"
    
    Write-Host "✅ Registration Successful!" -ForegroundColor Green
    Write-Host "User: $($registerResponse.user.username)" -ForegroundColor White
    Write-Host "Email: $($registerResponse.user.email)" -ForegroundColor White
    Write-Host "Token: $($registerResponse.token.Substring(0, 20))..." -ForegroundColor Gray
    
    $token = $registerResponse.token
} catch {
    Write-Host "❌ Registration Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "This might be because the user already exists - trying login instead..." -ForegroundColor Yellow
}

# Test 2: Login with the same credentials
Write-Host "`n2️⃣  Testing Login..." -ForegroundColor Yellow
$loginBody = @{
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:5001/api/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json"
    
    Write-Host "✅ Login Successful!" -ForegroundColor Green
    Write-Host "User: $($loginResponse.user.username)" -ForegroundColor White
    Write-Host "Email: $($loginResponse.user.email)" -ForegroundColor White
    Write-Host "Role: $($loginResponse.user.role)" -ForegroundColor White
    Write-Host "Token: $($loginResponse.token.Substring(0, 20))..." -ForegroundColor Gray
    
    $token = $loginResponse.token
} catch {
    Write-Host "❌ Login Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# Test 3: Get current user (protected route)
Write-Host "`n3️⃣  Testing Protected Route (Get Current User)..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    
    $meResponse = Invoke-RestMethod -Uri "http://localhost:5001/api/auth/me" `
        -Method GET `
        -Headers $headers
    
    Write-Host "✅ Protected Route Access Successful!" -ForegroundColor Green
    Write-Host "Authenticated as: $($meResponse.user.username)" -ForegroundColor White
    Write-Host "Account created: $($meResponse.user.createdAt)" -ForegroundColor White
} catch {
    Write-Host "❌ Protected Route Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✨ Authentication Test Complete!`n" -ForegroundColor Cyan
