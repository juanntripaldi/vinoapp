@echo off
chcp 65001 >nul
title Vinoapp
cd /d "%~dp0"

echo.
echo  ====================================
echo    VINOAPP - Lista de Precios
echo  ====================================
echo.

:: Verificar si node_modules existe
if not exist "node_modules" (
    echo  Instalando dependencias por primera vez...
    echo  (Esto puede tardar unos minutos)
    echo.
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo  ERROR: No se pudieron instalar las dependencias.
        echo  Asegurate de tener Node.js instalado.
        pause
        exit /b 1
    )
    echo.
    echo  Dependencias instaladas correctamente!
    echo.
)

:: Verificar si existe .env
if not exist ".env" (
    echo  AVISO: No existe el archivo .env
    echo  Para usar el Consultor IA, copiá .env.example como .env
    echo  y agrega tu clave de Anthropic.
    echo.
    copy ".env.example" ".env" >nul 2>&1
)

echo  Iniciando servidor...
echo.
node server.js

pause
