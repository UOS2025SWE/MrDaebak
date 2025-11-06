@echo off
echo ========================================
echo Dinner Service - Starting All Services
echo ========================================

echo.
echo Checking Docker service status...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not running.
    echo Please install and run Docker Desktop.
    pause
    exit /b 1
)

echo Docker check completed successfully.

echo.
echo Starting Docker services...
echo - PostgreSQL Database

docker-compose up -d

echo.
echo Starting pgAdmin Web Interface...
docker-compose --profile dev-tools up -d pgadmin

echo.
echo Waiting for services to start (5 seconds)...
timeout /t 5 /nobreak >nul

echo.
echo Checking container status...
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo Starting development servers...

echo.
echo Starting Frontend server... (in new window)
start "Frontend Server" cmd /c "cd frontend && npm run dev && pause"

echo.
echo Starting Backend server... (in new window)
start "Backend Server" cmd /c "uv run python main.py && pause"

echo.
echo ========================================
echo All services started successfully!
echo ========================================
echo.
echo Access Information:
echo - Frontend:    http://localhost:3000
echo - Backend API: http://localhost:8000  
echo - pgAdmin:     http://localhost:15050
echo   Login: admin@dinner.com / admin123
echo.
echo - PostgreSQL: localhost:15432
echo   DB: dinner_service / User: admin / password123
echo.
echo Happy coding!
echo.
pause