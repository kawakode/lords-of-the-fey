#!/bin/bash

# Lords of the Fey - Development Startup Script

echo "Starting Lords of the Fey..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "Edit .env to configure your settings"
fi

# Start the application
echo "Starting server on http://localhost:8080"
node server.js
