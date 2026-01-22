#!/bin/bash

# Aleo Order Book Matcher - Start Script
# This script sets up and starts the matcher service

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       Aleo Order Book Matcher - Startup Script           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found${NC}"
    echo "Creating .env from template..."
    cp .env.example .env
    echo -e "${RED}❌ Please edit .env with your configuration before running!${NC}"
    echo ""
    echo "Required settings:"
    echo "  - MATCHER_PRIVATE_KEY: Your Aleo private key"
    echo "  - MATCHER_ADDRESS: Your Aleo address"
    echo "  - CONTRACT_PROGRAM_ID: Deployed order book contract"
    echo ""
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js >= 18.0.0"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be >= 18.0.0${NC}"
    echo "Current version: $(node -v)"
    exit 1
fi

echo -e "${GREEN}✓ Node.js version: $(node -v)${NC}"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Create logs directory
if [ ! -d "logs" ]; then
    mkdir -p logs
    echo -e "${GREEN}✓ Created logs directory${NC}"
fi

# Build TypeScript
echo -e "${YELLOW}🔨 Building TypeScript...${NC}"
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

# Validate configuration
echo -e "${YELLOW}🔍 Validating configuration...${NC}"

source .env

if [ -z "$MATCHER_PRIVATE_KEY" ] || [ "$MATCHER_PRIVATE_KEY" = "APrivateKey1..." ]; then
    echo -e "${RED}❌ MATCHER_PRIVATE_KEY not configured${NC}"
    exit 1
fi

if [ -z "$MATCHER_ADDRESS" ] || [ "$MATCHER_ADDRESS" = "aleo1..." ]; then
    echo -e "${RED}❌ MATCHER_ADDRESS not configured${NC}"
    exit 1
fi

if [ -z "$CONTRACT_PROGRAM_ID" ]; then
    echo -e "${YELLOW}⚠️  CONTRACT_PROGRAM_ID not set, using default: sl.aleo${NC}"
fi

echo -e "${GREEN}✓ Configuration validated${NC}"

# Display configuration summary
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "                  Configuration Summary"
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}Network:${NC}             $ALEO_NETWORK"
echo -e "${BLUE}Contract:${NC}            $CONTRACT_PROGRAM_ID"
echo -e "${BLUE}Matcher Address:${NC}     ${MATCHER_ADDRESS:0:20}..."
echo -e "${BLUE}Scan Interval:${NC}       ${SCAN_INTERVAL_MS}ms"
echo -e "${BLUE}Min Profit:${NC}          ${MIN_PROFIT_BASIS_POINTS} basis points"
echo -e "${BLUE}Max Concurrent:${NC}      $MAX_CONCURRENT_MATCHES matches"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Ask for confirmation
read -p "Start the matcher service? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo -e "${GREEN}🚀 Starting Matcher Service...${NC}"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the service
npm start
