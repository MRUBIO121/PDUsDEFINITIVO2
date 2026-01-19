@echo off
echo ================================================================
echo   Energy Monitoring System - Despliegue en Produccion
echo ================================================================
echo.

echo [1/4] Verificando herramientas necesarias...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm no esta instalado
    echo Instala Node.js desde https://nodejs.org/
    pause
    exit /b 1
)

where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: pm2 no esta instalado
    echo Instala PM2 con: npm install -g pm2
    pause
    exit /b 1
)
echo EXITO: Herramientas verificadas
echo.

echo [2/5] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Fallo al instalar dependencias
    pause
    exit /b %errorlevel%
)
echo EXITO: Dependencias instaladas
echo.

echo [3/5] Corrigiendo vulnerabilidades...
call npm audit fix
echo EXITO: Vulnerabilidades corregidas
echo.

echo [4/5] Construyendo la aplicacion...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Fallo al construir la aplicacion
    pause
    exit /b %errorlevel%
)
echo EXITO: Aplicacion construida
echo.

echo [5/5] Desplegando con PM2...
call pm2 delete energy-monitoring-api 2>nul
call pm2 start ecosystem.config.cjs --env production
if %errorlevel% neq 0 (
    echo ERROR: Fallo al desplegar con PM2
    pause
    exit /b %errorlevel%
)
call pm2 save
echo EXITO: Aplicacion desplegada
echo.

echo ================================================================
echo          DESPLIEGUE COMPLETADO EXITOSAMENTE
echo ================================================================
echo.
echo La aplicacion esta ejecutandose en modo produccion
echo.
echo Comandos utiles:
echo   pm2 status              - Ver estado de la aplicacion
echo   pm2 restart energy-monitoring-api - Reiniciar aplicacion
echo   pm2 stop energy-monitoring-api    - Detener aplicacion
echo.
pause
