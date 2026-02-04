-- Script para añadir campos gwName y gwIp a las tablas de alertas
-- Ejecutar en SQL Server Management Studio o Azure Data Studio

-- Añadir campos a active_critical_alerts
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'active_critical_alerts'
    AND COLUMN_NAME = 'gwName'
)
BEGIN
    ALTER TABLE dbo.active_critical_alerts ADD gwName NVARCHAR(255) NULL;
    PRINT 'Campo gwName añadido a active_critical_alerts';
END
ELSE
BEGIN
    PRINT 'Campo gwName ya existe en active_critical_alerts';
END

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'active_critical_alerts'
    AND COLUMN_NAME = 'gwIp'
)
BEGIN
    ALTER TABLE dbo.active_critical_alerts ADD gwIp NVARCHAR(50) NULL;
    PRINT 'Campo gwIp añadido a active_critical_alerts';
END
ELSE
BEGIN
    PRINT 'Campo gwIp ya existe en active_critical_alerts';
END

-- Añadir campos a alerts_history
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'alerts_history'
    AND COLUMN_NAME = 'gwName'
)
BEGIN
    ALTER TABLE dbo.alerts_history ADD gwName NVARCHAR(255) NULL;
    PRINT 'Campo gwName añadido a alerts_history';
END
ELSE
BEGIN
    PRINT 'Campo gwName ya existe en alerts_history';
END

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'alerts_history'
    AND COLUMN_NAME = 'gwIp'
)
BEGIN
    ALTER TABLE dbo.alerts_history ADD gwIp NVARCHAR(50) NULL;
    PRINT 'Campo gwIp añadido a alerts_history';
END
ELSE
BEGIN
    PRINT 'Campo gwIp ya existe en alerts_history';
END

PRINT 'Script completado';
