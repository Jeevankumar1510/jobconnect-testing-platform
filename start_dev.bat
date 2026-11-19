@echo off
echo ===================================================
echo   Starting AI Job Connect Portal (Full-Stack)
echo ===================================================
echo.
echo [1/2] Launching Backend (FastAPI on Port 8001)...
start "JobConnect Backend (Port 8001)" cmd /k "cd /d %~dp0 && .\.venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8001 --reload"

echo [2/2] Launching Frontend (Next.js on Port 3000)...
start "JobConnect Frontend (Port 3000)" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo ===================================================
echo Servers are running in separate terminal windows:
echo - Frontend:        http://localhost:3000
echo - API Docs:        http://127.0.0.1:8001/docs
echo - Health Check:    http://127.0.0.1:8001/api/v1/health
echo - Django Admin:    http://127.0.0.1:8001/admin/
echo ===================================================
pause
