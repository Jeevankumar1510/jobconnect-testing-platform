# AI Job Connect Portal - Launch Both Servers in Separate Windows
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Starting AI Job Connect Portal (Full-Stack)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Launch FastAPI Backend on Port 8001
Write-Host "`n[1/2] Launching Backend on Port 8001 in new window..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root'; & '.\.venv\Scripts\python.exe' -m uvicorn api.main:app --host 127.0.0.1 --port 8001 --reload"

# 2. Launch Next.js Frontend on Port 3000
Write-Host "[2/2] Launching Frontend on Port 3000 in new window..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\frontend'; npm run dev"

Write-Host "`n===================================================" -ForegroundColor Green
Write-Host "Servers opened in separate terminal windows:" -ForegroundColor Green
Write-Host " - Frontend:     http://localhost:3000" -ForegroundColor White
Write-Host " - API Docs:     http://127.0.0.1:8001/docs" -ForegroundColor White
Write-Host " - Health Check: http://127.0.0.1:8001/api/v1/health" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Green
