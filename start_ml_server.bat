@echo off
REM UrbanSense AI - Edge ML Service Launcher
REM Hardcoded to Python 3.10 virtual environment with EasyOCR + PyTorch CUDA
set PYTHON_EXE=%~dp0ml\venv310\Scripts\python.exe

if not exist "%PYTHON_EXE%" (
    echo [ERROR] Virtual environment python not found at: %PYTHON_EXE%
    pause
    exit /b 1
)

echo [UrbanSense AI] Starting Edge ML Server using Python 3.10: %PYTHON_EXE%
"%PYTHON_EXE%" -m uvicorn ml.api.ml_server:app --host 127.0.0.1 --port 8000
