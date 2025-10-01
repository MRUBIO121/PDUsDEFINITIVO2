@echo off
echo ============================================
echo Verificacion de SQL Server para Energy Monitoring
echo ============================================
echo.

echo [1/4] Verificando si SQL Server esta en ejecución...
sc query "MSSQLSERVER" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Servicio MSSQLSERVER encontrado
    sc query "MSSQLSERVER" | findstr "RUNNING" >nul
    if %errorlevel% equ 0 (
        echo ✅ SQL Server esta EJECUTANDOSE
    ) else (
        echo ❌ SQL Server esta DETENIDO
        echo.
        echo Para iniciar SQL Server, ejecuta como Administrador:
        echo net start MSSQLSERVER
        echo.
        pause
        exit /b 1
    )
) else (
    echo ❌ Servicio MSSQLSERVER no encontrado
    echo Verifica que SQL Server este instalado
    pause
    exit /b 1
)
echo.

echo [2/4] Verificando conectividad TCP en puerto 1433...
netstat -an | findstr "1433" >nul
if %errorlevel% equ 0 (
    echo ✅ Puerto 1433 esta en uso (SQL Server escuchando)
) else (
    echo ❌ Puerto 1433 no esta disponible
    echo Verifica la configuración de TCP/IP en SQL Server
)
echo.

echo [3/4] Intentando conexión con sqlcmd...
echo (Esto puede tardar unos segundos...)
sqlcmd -S localhost -U sa -Q "SELECT @@VERSION" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Conexión SQL exitosa con usuario 'sa'
) else (
    echo ❌ Error de conexión SQL
    echo Verifica:
    echo - Usuario y contraseña de 'sa'
    echo - Que SQL Server Authentication este habilitado
    echo - Que el usuario 'sa' este habilitado
)
echo.

echo [4/4] Verificando si existe la base de datos...
sqlcmd -S localhost -U sa -Q "SELECT name FROM sys.databases WHERE name = 'energy_monitor_db'" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Base de datos 'energy_monitor_db' encontrada
) else (
    echo ⚠️ Base de datos 'energy_monitor_db' NO encontrada
    echo Necesitas crearla ejecutando las migraciones SQL
)
echo.

echo ============================================
echo Verificación completada
echo ============================================
echo.
echo Si hay errores, corrigelos antes de continuar.
echo Si todo esta bien, puedes reiniciar el backend.
echo.
pause