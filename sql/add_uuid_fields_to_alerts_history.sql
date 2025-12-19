-- ============================================================================================================
-- ARCHIVO: add_uuid_fields_to_alerts_history.sql
-- PROPOSITO: Añadir campos uuid_open y uuid_closed a la tabla alerts_history
-- FECHA: 2025-12-19
-- VERSION: 1.0
-- ============================================================================================================
--
-- Este script añade los campos uuid_open y uuid_closed a la tabla alerts_history
-- para conservar el historial completo de identificadores SONAR cuando las alertas se resuelven.
--
-- CAMPOS AÑADIDOS:
--   - uuid_open   : Identificador SONAR cuando se abre la alerta
--   - uuid_closed : Identificador SONAR cuando se cierra la alerta
--
-- NOTA: Cada vez que un rack entra en alerta critica se crea un nuevo registro.
--       Cuando se resuelve, se actualiza ese registro con resolved_at y los UUIDs.
--       Asi se mantiene el historial completo de todas las alertas.
--
-- ============================================================================================================

USE energy_monitor_db;
GO

PRINT '============================================================================================================';
PRINT 'Añadiendo campos UUID a la tabla alerts_history';
PRINT '============================================================================================================';
PRINT '';

-- ============================================================================================================
-- Añadir campo uuid_open si no existe
-- ============================================================================================================

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('alerts_history')
    AND name = 'uuid_open'
)
BEGIN
    ALTER TABLE alerts_history ADD uuid_open NVARCHAR(255) NULL;
    PRINT 'Campo uuid_open agregado exitosamente a alerts_history';
END
ELSE
BEGIN
    PRINT 'Campo uuid_open ya existe en alerts_history';
END
GO

-- ============================================================================================================
-- Añadir campo uuid_closed si no existe
-- ============================================================================================================

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('alerts_history')
    AND name = 'uuid_closed'
)
BEGIN
    ALTER TABLE alerts_history ADD uuid_closed NVARCHAR(255) NULL;
    PRINT 'Campo uuid_closed agregado exitosamente a alerts_history';
END
ELSE
BEGIN
    PRINT 'Campo uuid_closed ya existe en alerts_history';
END
GO

-- ============================================================================================================
-- Crear indices para los nuevos campos (mejora busquedas por UUID)
-- ============================================================================================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_alerts_history_uuid_open')
BEGIN
    CREATE INDEX IX_alerts_history_uuid_open ON alerts_history(uuid_open);
    PRINT 'Indice IX_alerts_history_uuid_open creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_alerts_history_uuid_closed')
BEGIN
    CREATE INDEX IX_alerts_history_uuid_closed ON alerts_history(uuid_closed);
    PRINT 'Indice IX_alerts_history_uuid_closed creado';
END
GO

-- ============================================================================================================
-- Verificacion
-- ============================================================================================================

PRINT '';
PRINT '============================================================================================================';
PRINT 'VERIFICACION: Estructura actual de alerts_history';
PRINT '============================================================================================================';

SELECT
    COLUMN_NAME as Campo,
    DATA_TYPE as Tipo,
    CHARACTER_MAXIMUM_LENGTH as Longitud,
    IS_NULLABLE as Nullable
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'alerts_history'
ORDER BY ORDINAL_POSITION;

PRINT '';
PRINT '============================================================================================================';
PRINT 'Script completado exitosamente';
PRINT '============================================================================================================';
GO
