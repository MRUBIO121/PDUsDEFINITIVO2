@echo off
echo ============================================
echo Configuracion de Base de Datos REMOTA para Energy Monitoring
echo ============================================
echo.

echo Este script configurara la base de datos en el servidor SQL remoto.
echo.
echo Por favor ingresa la informacion del servidor:
set /p SQL_HOST="Servidor SQL (IP o nombre): "
set /p SQL_USER="Usuario SQL (ej: sa): "
echo.

echo [1/3] Verificando conexion al servidor %SQL_HOST%...
sqlcmd -S %SQL_HOST% -U %SQL_USER% -Q "SELECT @@VERSION" -W >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ No se puede conectar al servidor %SQL_HOST%
    echo Verifica la conexion y credenciales
    pause
    exit /b %errorlevel%
)
echo ✅ Conexion exitosa al servidor %SQL_HOST%
echo.

echo [2/3] Ejecutando script de configuracion de base de datos...
sqlcmd -S %SQL_HOST% -U %SQL_USER% -i setup-database.sql -o database-setup.log
if %errorlevel% neq 0 (
    echo ❌ Error ejecutando el script de base de datos
    echo Revisa el archivo database-setup.log para detalles
    pause
    exit /b %errorlevel%
)
echo ✅ Base de datos configurada correctamente
echo.

echo [3/3] Verificando tablas creadas...
sqlcmd -S %SQL_HOST% -U %SQL_USER% -Q "USE energy_monitor_db; SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'" -W
if %errorlevel% equ 0 (
    echo ✅ Tablas verificadas exitosamente
) else (
    echo ❌ Error verificando tablas
)
echo.

echo ============================================
echo Configuracion completada
echo ============================================
echo.
echo Ahora actualiza tu archivo .env con:
echo SQL_SERVER_HOST=%SQL_HOST%
echo SQL_SERVER_USER=%SQL_USER%
echo SQL_SERVER_PASSWORD=tu_password_aqui
echo.
echo Despues ejecuta: pm2 restart energy-monitoring-api
echo.
pause