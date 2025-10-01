@echo off
echo Iniciando despliegue de la aplicacion Energy Monitoring System...
echo.

echo [0/7] Verificando herramientas necesarias...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm no se encuentra en el PATH del sistema
    echo Instala Node.js desde https://nodejs.org/
    pause
    exit /b %errorlevel%
)
echo EXITO: npm encontrado en el sistema
echo.

where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: pm2 no se encuentra en el PATH del sistema
    echo Instala PM2 con: npm install -g pm2
    pause
    exit /b %errorlevel%
)
echo EXITO: pm2 encontrado en el sistema
echo.

echo [1/6] Instalando dependencias del frontend...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Fallo al instalar dependencias del frontend
    pause
    exit /b %errorlevel%
)
echo EXITO: Dependencias del frontend instaladas correctamente
echo.

echo [2/6] Cambiando al directorio backend...
cd .\backend\
if %errorlevel% neq 0 (
    echo ERROR: No se pudo acceder al directorio backend
    pause
    exit /b %errorlevel%
)
echo EXITO: Cambio al directorio backend completado
echo.

echo [3/6] Instalando dependencias del backend...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Fallo al instalar dependencias del backend
    pause
    exit /b %errorlevel%
)
echo EXITO: Dependencias del backend instaladas correctamente
echo.

echo [4/6] Regresando al directorio raiz...
cd ..
if %errorlevel% neq 0 (
    echo ERROR: No se pudo regresar al directorio raiz
    pause
    exit /b %errorlevel%
)
echo EXITO: Regreso al directorio raiz completado
echo.

echo [5/6] Construyendo la aplicacion...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Fallo al construir la aplicacion
    pause
    exit /b %errorlevel%
)
echo EXITO: Aplicacion construida correctamente
echo.

echo [6/6] Iniciando el servicio con PM2...
call pm2 start .\ecosystem.config.cjs
if %errorlevel% neq 0 (
    echo ERROR: Fallo al iniciar el servicio con PM2
    pause
    exit /b %errorlevel%
)
echo EXITO: Servicio iniciado correctamente con PM2
echo.

echo ================================================================
echo          DESPLIEGUE COMPLETADO EXITOSAMENTE
echo ================================================================
echo La aplicacion Energy Monitoring System esta ahora ejecutandose.
echo Mostrando logs en tiempo real...
echo.
echo Presiona Ctrl+C para detener la visualizacion de logs.
echo.

rem call pm2 logs energy-monitoring-api