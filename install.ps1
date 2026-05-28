# install.ps1 - DÜZGÜN VERSİYA (PowerShell üçün)

Write-Host "🚀 Tracking System Quraşdırılması Başlayır..." -ForegroundColor Green

# Backend
Write-Host "`n📦 Backend paketləri quraşdırılır..." -ForegroundColor Yellow
Set-Location C:\Users\fullm\Downloads\tracking-system\backend
npm install express socket.io pg cors dotenv jsonwebtoken bcrypt nodemon

# Python Service
Write-Host "`n🐍 Python paketləri quraşdırılır..." -ForegroundColor Yellow
Set-Location C:\Users\fullm\Downloads\tracking-system\python-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install asyncpg websockets
deactivate

# Frontend
Write-Host "`n⚛️ Frontend paketləri quraşdırılır..." -ForegroundColor Yellow
Set-Location C:\Users\fullm\Downloads\tracking-system\frontend
npm install socket.io-client leaflet react-leaflet axios

Write-Host "`n✅ Quraşdırma tamamlandı!" -ForegroundColor Green
Write-Host ""
Write-Host "İşə salmaq üçün:" -ForegroundColor Cyan
Write-Host "1. PostgreSQL-i işə salın"
Write-Host "2. Terminal 1 (Backend):"
Write-Host "   cd C:\Users\fullm\Downloads\tracking-system\backend"
Write-Host "   npm start"
Write-Host ""
Write-Host "3. Terminal 2 (Python):"
Write-Host "   cd C:\Users\fullm\Downloads\tracking-system\python-service"
Write-Host "   .\venv\Scripts\Activate.ps1"
Write-Host "   python gps_processor.py"
Write-Host ""
Write-Host "4. Terminal 3 (Frontend):"
Write-Host "   cd C:\Users\fullm\Downloads\tracking-system\frontend"
Write-Host "   npm start"