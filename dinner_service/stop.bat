@echo off
echo ========================================
echo Dinner Service - Stopping Services
echo ========================================

echo.
echo Stopping web servers...
echo - FastAPI Backend (port 8000)
echo - Next.js Frontend (port 3000)

echo Terminating processes on port 8000 (FastAPI)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" 2^>nul') do taskkill /F /PID %%a 2>nul

echo Terminating processes on port 3000 (Next.js)...  
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" 2^>nul') do taskkill /F /PID %%a 2>nul

echo Terminating Python/FastAPI processes by name...
taskkill /F /IM python.exe 2>nul
taskkill /F /IM uvicorn.exe 2>nul

echo Terminating Node.js processes on specific ports only...
echo (Avoiding killing Claude Code and other system processes)

echo.
echo Stopping Docker services...
echo - PostgreSQL Database
echo - pgAdmin Web Interface

echo Stopping main services...
docker compose down

echo Stopping development tools (pgAdmin)...
docker compose --profile dev-tools down

echo.
echo Stopping additional containers...
docker stop dinner_service_pgadmin 2>nul
docker stop dinner_service_db 2>nul

echo.
echo Checking port status...
echo Port 8000 (FastAPI):
netstat -ano | findstr ":8000" || echo - No processes found on port 8000
echo Port 3000 (Next.js):
netstat -ano | findstr ":3000" || echo - No processes found on port 3000

echo.
echo Checking container status...
docker ps

echo.
echo ========================================
echo All services stopped successfully!
echo ========================================
echo.
echo 🛑 Web servers (FastAPI + Next.js) terminated
echo 🛑 Docker containers stopped
echo 💾 Data safely stored in Docker volumes
echo.
echo Run start.bat to restart all services.
echo.
pause