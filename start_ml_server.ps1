# UrbanSense AI - Edge ML Service Launcher
# Hardcoded to Python 3.10 virtual environment with EasyOCR + PyTorch CUDA
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$PythonExe = Join-Path $ScriptDir "ml\venv310\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Error "[ERROR] Virtual environment python not found at: $PythonExe"
    exit 1
}

Write-Host "[UrbanSense AI] Starting Edge ML Server using Python 3.10: $PythonExe" -ForegroundColor Cyan
& $PythonExe -m uvicorn ml.api.ml_server:app --host 127.0.0.1 --port 8000
