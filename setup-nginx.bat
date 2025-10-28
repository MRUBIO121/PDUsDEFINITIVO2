@echo off
REM Batch Script to Setup Nginx for Energy Monitoring System
REM Run as Administrator

echo ========================================
echo    Nginx Setup for Energy Monitoring
echo ========================================
echo.

REM Define nginx base path
set NGINX_PATH=D:\nginx
set TEMP_PATH=%NGINX_PATH%\temp

REM Check if nginx directory exists
if not exist "%NGINX_PATH%" (
    echo ERROR: Nginx directory not found at %NGINX_PATH%
    echo Please install nginx first or update the path in this script.
    echo.
    pause
    exit /b 1
)

echo Step 1: Creating temporary directories...

REM Create all required temp directories
if not exist "%TEMP_PATH%" mkdir "%TEMP_PATH%"
if not exist "%TEMP_PATH%\client_body_temp" mkdir "%TEMP_PATH%\client_body_temp"
if not exist "%TEMP_PATH%\proxy_temp" mkdir "%TEMP_PATH%\proxy_temp"
if not exist "%TEMP_PATH%\fastcgi_temp" mkdir "%TEMP_PATH%\fastcgi_temp"
if not exist "%TEMP_PATH%\uwsgi_temp" mkdir "%TEMP_PATH%\uwsgi_temp"
if not exist "%TEMP_PATH%\scgi_temp" mkdir "%TEMP_PATH%\scgi_temp"

if exist "%TEMP_PATH%\client_body_temp" (
    echo   [OK] Created: %TEMP_PATH%\client_body_temp
) else (
    echo   [FAIL] Failed to create: %TEMP_PATH%\client_body_temp
)

if exist "%TEMP_PATH%\proxy_temp" (
    echo   [OK] Created: %TEMP_PATH%\proxy_temp
) else (
    echo   [FAIL] Failed to create: %TEMP_PATH%\proxy_temp
)

if exist "%TEMP_PATH%\fastcgi_temp" (
    echo   [OK] Created: %TEMP_PATH%\fastcgi_temp
) else (
    echo   [FAIL] Failed to create: %TEMP_PATH%\fastcgi_temp
)

if exist "%TEMP_PATH%\uwsgi_temp" (
    echo   [OK] Created: %TEMP_PATH%\uwsgi_temp
) else (
    echo   [FAIL] Failed to create: %TEMP_PATH%\uwsgi_temp
)

if exist "%TEMP_PATH%\scgi_temp" (
    echo   [OK] Created: %TEMP_PATH%\scgi_temp
) else (
    echo   [FAIL] Failed to create: %TEMP_PATH%\scgi_temp
)

echo.
echo Step 2: Checking nginx configuration...

REM Check if nginx.conf exists
set NGINX_CONF=%NGINX_PATH%\conf\nginx.conf
if not exist "%NGINX_CONF%" (
    echo   [FAIL] nginx.conf not found at %NGINX_CONF%
    echo          Please copy nginx.conf from the project to %NGINX_PATH%\conf\
) else (
    echo   [OK] nginx.conf found
)

echo.
echo Step 3: Creating pdus directory...

REM Create pdus directory for application
set PDUS_PATH=%NGINX_PATH%\pdus
if not exist "%PDUS_PATH%" mkdir "%PDUS_PATH%"
if exist "%PDUS_PATH%" (
    echo   [OK] Created: %PDUS_PATH%
) else (
    echo   [FAIL] Failed to create: %PDUS_PATH%
)

REM Create dist subdirectory
set DIST_PATH=%PDUS_PATH%\dist
if not exist "%DIST_PATH%" mkdir "%DIST_PATH%"
if exist "%DIST_PATH%" (
    echo   [OK] Created: %DIST_PATH%
) else (
    echo   [FAIL] Failed to create: %DIST_PATH%
)

echo.
echo Step 4: Testing nginx configuration...

REM Test nginx configuration
set NGINX_EXE=%NGINX_PATH%\nginx.exe
if exist "%NGINX_EXE%" (
    cd /d "%NGINX_PATH%"
    nginx.exe -t
    if %ERRORLEVEL% EQU 0 (
        echo   [OK] Nginx configuration is valid
        echo.
        echo ========================================
        echo    Setup Complete!
        echo ========================================
        echo.
        echo Next steps:
        echo 1. Copy nginx.conf to: %NGINX_PATH%\conf\
        echo 2. Build your project: npm run build
        echo 3. Copy dist folder to: %PDUS_PATH%\dist\
        echo 4. Start backend: npm run server
        echo 5. Start nginx: cd %NGINX_PATH% ^&^& nginx.exe
        echo 6. Access at: http://localhost
    ) else (
        echo   [FAIL] Nginx configuration test failed
    )
) else (
    echo   [FAIL] nginx.exe not found at %NGINX_EXE%
)

echo.
pause
