# PowerShell Script to Setup Nginx for Energy Monitoring System
# Run as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Nginx Setup for Energy Monitoring" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Define nginx base path
$nginxPath = "D:\nginx"
$tempPath = "$nginxPath\temp"

# Check if nginx directory exists
if (-not (Test-Path $nginxPath)) {
    Write-Host "ERROR: Nginx directory not found at $nginxPath" -ForegroundColor Red
    Write-Host "Please install nginx first or update the path in this script." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Step 1: Creating temporary directories..." -ForegroundColor Yellow

# Create all required temp directories
$tempDirs = @(
    "$tempPath",
    "$tempPath\client_body_temp",
    "$tempPath\proxy_temp",
    "$tempPath\fastcgi_temp",
    "$tempPath\uwsgi_temp",
    "$tempPath\scgi_temp"
)

foreach ($dir in $tempDirs) {
    if (-not (Test-Path $dir)) {
        try {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
            Write-Host "  ✓ Created: $dir" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ Failed to create: $dir" -ForegroundColor Red
            Write-Host "    Error: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "  ✓ Already exists: $dir" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Step 2: Checking nginx configuration..." -ForegroundColor Yellow

# Check if nginx.conf exists
$nginxConf = "$nginxPath\conf\nginx.conf"
if (-not (Test-Path $nginxConf)) {
    Write-Host "  ✗ nginx.conf not found at $nginxConf" -ForegroundColor Red
    Write-Host "    Please copy nginx.conf from the project to $nginxPath\conf\" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ nginx.conf found" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 3: Creating pdus directory..." -ForegroundColor Yellow

# Create pdus directory for application
$pdusPath = "$nginxPath\pdus"
if (-not (Test-Path $pdusPath)) {
    try {
        New-Item -ItemType Directory -Force -Path $pdusPath | Out-Null
        Write-Host "  ✓ Created: $pdusPath" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Failed to create: $pdusPath" -ForegroundColor Red
    }
} else {
    Write-Host "  ✓ Already exists: $pdusPath" -ForegroundColor Gray
}

# Create dist subdirectory
$distPath = "$pdusPath\dist"
if (-not (Test-Path $distPath)) {
    try {
        New-Item -ItemType Directory -Force -Path $distPath | Out-Null
        Write-Host "  ✓ Created: $distPath" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Failed to create: $distPath" -ForegroundColor Red
    }
} else {
    Write-Host "  ✓ Already exists: $distPath" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Step 4: Testing nginx configuration..." -ForegroundColor Yellow

# Test nginx configuration
$nginxExe = "$nginxPath\nginx.exe"
if (Test-Path $nginxExe) {
    try {
        $testResult = & $nginxExe -t 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Nginx configuration is valid" -ForegroundColor Green
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host "   Setup Complete!" -ForegroundColor Green
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Next steps:" -ForegroundColor Yellow
            Write-Host "1. Copy nginx.conf to: $nginxPath\conf\" -ForegroundColor White
            Write-Host "2. Build your project: npm run build" -ForegroundColor White
            Write-Host "3. Copy dist folder to: $pdusPath\dist\" -ForegroundColor White
            Write-Host "4. Start backend: npm run server" -ForegroundColor White
            Write-Host "5. Start nginx: cd $nginxPath && nginx.exe" -ForegroundColor White
            Write-Host "6. Access at: http://localhost" -ForegroundColor White
        } else {
            Write-Host "  ✗ Nginx configuration test failed" -ForegroundColor Red
            Write-Host $testResult -ForegroundColor Red
        }
    } catch {
        Write-Host "  ✗ Error testing nginx configuration" -ForegroundColor Red
        Write-Host "    $_" -ForegroundColor Red
    }
} else {
    Write-Host "  ✗ nginx.exe not found at $nginxExe" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to exit"
