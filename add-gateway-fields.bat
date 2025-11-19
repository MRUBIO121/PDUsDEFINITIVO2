@echo off
setlocal

echo ============================================================================================================
echo AGREGANDO CAMPOS DE GATEWAY A LA BASE DE DATOS
echo ============================================================================================================
echo.

REM Cargar variables de entorno
if not exist .env (
    echo ERROR: Archivo .env no encontrado
    pause
    exit /b 1
)

for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
    set "%%a=%%b"
)

echo Ejecutando migracion de base de datos...
echo Server: %DB_SERVER%
echo Database: %DB_NAME%
echo.

sqlcmd -S %DB_SERVER% -d %DB_NAME% -U %DB_USER% -P %DB_PASSWORD% -i "supabase\migrations\00000000000000_complete_database_setup.sql" -b

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================================================================
    echo MIGRACION COMPLETADA EXITOSAMENTE
    echo ============================================================================================================
    echo.
    echo Los campos gwName y gwIp han sido agregados a la tabla maintenance_rack_details
    echo.
    echo Ahora reinicie el servidor con: npm run server
    echo.
) else (
    echo.
    echo ============================================================================================================
    echo ERROR EN LA MIGRACION
    echo ============================================================================================================
    echo.
    echo Por favor revise los errores anteriores
    echo.
)

pause
