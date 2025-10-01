@echo off
echo ============================================
echo Verificacion de SQL Server REMOTO para Energy Monitoring
echo ============================================
echo.

echo Por favor ingresa la direccion del servidor SQL:
set /p SQL_HOST="Servidor SQL (IP o nombre): "
echo.

echo [1/4] Verificando conectividad de red al servidor %SQL_HOST%...
ping -n 2 %SQL_HOST% >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Servidor %SQL_HOST% es accesible por red
) else (
    echo ❌ No se puede alcanzar el servidor %SQL_HOST%
    echo Verifica:
    echo - Que la direccion IP/nombre sea correcta
    echo - Que no haya firewall bloqueando
    echo - Que el servidor este encendido
    pause
    exit /b 1
)
echo.

echo [2/4] Verificando si el puerto 1433 esta abierto en %SQL_HOST%...
powershell -Command "Test-NetConnection -ComputerName %SQL_HOST% -Port 1433 -WarningAction SilentlyContinue" | findstr "TcpTestSucceeded.*True" >nul
if %errorlevel% equ 0 (
    echo ✅ Puerto 1433 esta abierto en %SQL_HOST%
) else (
    echo ❌ Puerto 1433 no esta disponible en %SQL_HOST%
    echo Verifica:
    echo - Que SQL Server este ejecutandose en el servidor remoto
    echo - Que TCP/IP este habilitado en SQL Server Configuration Manager
    echo - Que el firewall del servidor permita conexiones en puerto 1433
    echo - Que SQL Server Browser este ejecutandose si usas instancias nombradas
)
echo.

echo [3/4] Intentando conexion SQL con sqlcmd...
echo (Ingresa la contraseña cuando se solicite)
sqlcmd -S %SQL_HOST% -U sa -Q "SELECT @@VERSION, @@SERVERNAME" -W
if %errorlevel% equ 0 (
    echo ✅ Conexión SQL exitosa al servidor remoto
) else (
    echo ❌ Error de conexión SQL al servidor %SQL_HOST%
    echo Verifica:
    echo - Usuario y contraseña correctos
    echo - Que SQL Server Authentication este habilitado
    echo - Que el usuario 'sa' este habilitado y tenga permisos
    echo - Que 'Allow remote connections' este habilitado en SQL Server
)
echo.

echo [4/4] Verificando si existe la base de datos energy_monitor_db...
sqlcmd -S %SQL_HOST% -U sa -Q "SELECT name FROM sys.databases WHERE name = 'energy_monitor_db'" -W >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Base de datos 'energy_monitor_db' encontrada en %SQL_HOST%
) else (
    echo ⚠️ Base de datos 'energy_monitor_db' NO encontrada en %SQL_HOST%
    echo Necesitas crearla ejecutando el script setup-database.sql en el servidor remoto
)
echo.

echo ============================================
echo Verificación de servidor SQL REMOTO completada
echo ============================================
echo.
echo Si hay errores, corrigelos en el servidor %SQL_HOST% antes de continuar.
echo Si todo esta bien, actualiza el archivo .env con:
echo SQL_SERVER_HOST=%SQL_HOST%
echo.
pause