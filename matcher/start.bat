@echo off
REM Aleo Order Book Matcher - Windows Start Script

echo ===============================================================
echo        Aleo Order Book Matcher - Startup Script
echo ===============================================================
echo.

REM Check if .env exists
if not exist .env (
    echo [WARNING] No .env file found
    echo Creating .env from template...
    copy .env.example .env
    echo.
    echo [ERROR] Please edit .env with your configuration before running!
    echo.
    echo Required settings:
    echo   - MATCHER_PRIVATE_KEY: Your Aleo private key
    echo   - MATCHER_ADDRESS: Your Aleo address
    echo   - CONTRACT_PROGRAM_ID: Deployed order book contract
    echo.
    pause
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed
    echo Please install Node.js ^>= 18.0.0 from https://nodejs.org
    pause
    exit /b 1
)

echo [OK] Node.js version:
node -v
echo.

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
    echo.
) else (
    echo [OK] Dependencies already installed
    echo.
)

REM Create logs directory
if not exist logs mkdir logs

REM Build TypeScript
echo Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)
echo [OK] Build successful
echo.

REM Load environment variables
for /f "tokens=1,2 delims==" %%a in (.env) do (
    set %%a=%%b
)

REM Display configuration
echo ===============================================================
echo                  Configuration Summary
echo ===============================================================
echo Network:             %ALEO_NETWORK%
echo Contract:            %CONTRACT_PROGRAM_ID%
echo Scan Interval:       %SCAN_INTERVAL_MS%ms
echo Min Profit:          %MIN_PROFIT_BASIS_POINTS% basis points
echo Max Concurrent:      %MAX_CONCURRENT_MATCHES% matches
echo ===============================================================
echo.

REM Ask for confirmation
set /p confirm="Start the matcher service? (y/n): "
if /i not "%confirm%"=="y" (
    echo Cancelled
    exit /b 0
)

echo.
echo Starting Matcher Service...
echo.
echo Press Ctrl+C to stop
echo.

REM Start the service
call npm start
