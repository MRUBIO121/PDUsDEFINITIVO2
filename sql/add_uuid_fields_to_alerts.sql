-- ============================================================================================================
-- ARCHIVO: add_uuid_fields_to_alerts.sql
-- PROPOSITO: Añadir campos UUIDopen y UUIDclosed a la tabla de alertas activas
-- FECHA: 2025-12-18
-- VERSION: 1.0
-- ============================================================================================================
--
-- Este script añade los campos uuid_open y uuid_closed a la tabla active_critical_alerts
-- para permitir el seguimiento de identificadores externos de apertura y cierre de tickets.
--
-- CAMPOS AÑADIDOS:
--   - uuid_open   : Identificador externo cuando se abre la alerta/ticket
--   - uuid_closed : Identificador externo cuando se cierra la alerta/ticket
--
-- ============================================================================================================

USE energy_monitor_db;
GO

PRINT '============================================================================================================';
PRINT 'Añadiendo campos UUID a la tabla active_critical_alerts';
PRINT '============================================================================================================';
PRINT '';

-- ============================================================================================================
-- Añadir campo uuid_open si no existe
-- ============================================================================================================

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('active_critical_alerts')
    AND name = 'uuid_open'
)
BEGIN
    ALTER TABLE active_critical_alerts ADD uuid_open NVARCHAR(255) NULL;
    PRINT 'Campo uuid_open agregado exitosamente a active_critical_alerts';
END
ELSE
BEGIN
    PRINT 'Campo uuid_open ya existe en active_critical_alerts';
END
GO

-- ============================================================================================================
-- Añadir campo uuid_closed si no existe
-- ============================================================================================================

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('active_critical_alerts')
    AND name = 'uuid_closed'
)
BEGIN
    ALTER TABLE active_critical_alerts ADD uuid_closed NVARCHAR(255) NULL;
    PRINT 'Campo uuid_closed agregado exitosamente a active_critical_alerts';
END
ELSE
BEGIN
    PRINT 'Campo uuid_closed ya existe en active_critical_alerts';
END
GO

-- ============================================================================================================
-- Crear indices para los nuevos campos (opcional, para mejorar busquedas)
-- ============================================================================================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_active_critical_alerts_uuid_open')
BEGIN
    CREATE INDEX IX_active_critical_alerts_uuid_open ON active_critical_alerts(uuid_open);
    PRINT 'Indice IX_active_critical_alerts_uuid_open creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_active_critical_alerts_uuid_closed')
BEGIN
    CREATE INDEX IX_active_critical_alerts_uuid_closed ON active_critical_alerts(uuid_closed);
    PRINT 'Indice IX_active_critical_alerts_uuid_closed creado';
END
GO

-- ============================================================================================================
-- Verificacion
-- ============================================================================================================

PRINT '';
PRINT '============================================================================================================';
PRINT 'VERIFICACION: Estructura actual de active_critical_alerts';
PRINT '============================================================================================================';

SELECT
    COLUMN_NAME as Campo,
    DATA_TYPE as Tipo,
    CHARACTER_MAXIMUM_LENGTH as Longitud,
    IS_NULLABLE as Nullable
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'active_critical_alerts'
ORDER BY ORDINAL_POSITION;

PRINT '';
PRINT '============================================================================================================';
PRINT 'Script completado exitosamente';
PRINT '============================================================================================================';
GO
