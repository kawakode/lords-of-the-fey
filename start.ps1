# Lords of the Fey - Development Startup Script (Windows)

Write-Host "Starting Lords of the Fey..." -ForegroundColor Green

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "Edit .env to configure your settings"
}

# Start the application
Write-Host "Starting server on http://localhost:8080" -ForegroundColor Green
node server.js
