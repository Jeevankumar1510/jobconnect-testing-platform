Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Starting AI Job Connect Portal (Full-Stack)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

$root = $PSScriptRoot

Write-Host "[1/2] Starting Backend (FastAPI on Port 8001)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; .\.venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8001 --reload"

Write-Host "[2/2] Starting Frontend (Next.js on Port 3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Servers are launching in separate PowerShell windows:" -ForegroundColor Yellow
Write-Host " - Frontend:     http://localhost:3000" -ForegroundColor White
Write-Host " - API Docs:     http://127.0.0.1:8001/docs" -ForegroundColor White
Write-Host " - Health Check: http://127.0.0.1:8001/api/v1/health" -ForegroundColor White
Write-Host " - Django Admin: http://127.0.0.1:8001/admin/" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Cyan
