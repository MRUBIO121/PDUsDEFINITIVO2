/*
  # Añadir soporte para dos PDUs por rack en mantenimiento

  ## Descripción
  Esta migración modifica la tabla `maintenance_rack_details` para soportar
  el almacenamiento de información de dos PDUs por rack físico, incluyendo
  sus IDs y números de serie individuales.

  ## Cambios en la tabla maintenance_rack_details

  1. Nuevos campos para PDU 1:
    - `pdu1_id` (NVARCHAR(255)) - ID de la primera PDU
    - `pdu1_serial` (NVARCHAR(255)) - Serial de la primera PDU

  2. Nuevos campos para PDU 2:
    - `pdu2_id` (NVARCHAR(255)) - ID de la segunda PDU
    - `pdu2_serial` (NVARCHAR(255)) - Serial de la segunda PDU

  3. Migración de datos existentes:
    - Los valores actuales de `pdu_id` se copian a `pdu1_id`
    - Los valores actuales de `serial` se copian a `pdu1_serial`
    - Los campos originales `pdu_id` y `serial` se mantienen por compatibilidad

  ## Notas
  - Los campos `pdu_id` y `serial` originales se mantienen por compatibilidad
  - El código frontend ahora mostrará PDU 1 y PDU 2 con sus respectivos seriales
  - Si solo hay datos para PDU 1, PDU 2 mostrará valores NULL o vacíos
*/

USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================================================';
PRINT 'MIGRACIÓN: Añadir soporte para dos PDUs por rack';
PRINT '============================================================================================================';
PRINT '';

-- ============================================================================================================
-- PASO 1: Añadir columnas para PDU 1
-- ============================================================================================================

PRINT 'Paso 1: Añadiendo columnas para PDU 1...';

-- Añadir pdu1_id
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'maintenance_rack_details'
    AND COLUMN_NAME = 'pdu1_id'
)
BEGIN
    ALTER TABLE maintenance_rack_details
    ADD pdu1_id NVARCHAR(255) NULL;
    PRINT '✅ Columna pdu1_id añadida';
END
ELSE
BEGIN
    PRINT 'ℹ️  Columna pdu1_id ya existe';
END

-- Añadir pdu1_serial
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'maintenance_rack_details'
    AND COLUMN_NAME = 'pdu1_serial'
)
BEGIN
    ALTER TABLE maintenance_rack_details
    ADD pdu1_serial NVARCHAR(255) NULL;
    PRINT '✅ Columna pdu1_serial añadida';
END
ELSE
BEGIN
    PRINT 'ℹ️  Columna pdu1_serial ya existe';
END

-- ============================================================================================================
-- PASO 2: Añadir columnas para PDU 2
-- ============================================================================================================

PRINT '';
PRINT 'Paso 2: Añadiendo columnas para PDU 2...';

-- Añadir pdu2_id
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'maintenance_rack_details'
    AND COLUMN_NAME = 'pdu2_id'
)
BEGIN
    ALTER TABLE maintenance_rack_details
    ADD pdu2_id NVARCHAR(255) NULL;
    PRINT '✅ Columna pdu2_id añadida';
END
ELSE
BEGIN
    PRINT 'ℹ️  Columna pdu2_id ya existe';
END

-- Añadir pdu2_serial
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'maintenance_rack_details'
    AND COLUMN_NAME = 'pdu2_serial'
)
BEGIN
    ALTER TABLE maintenance_rack_details
    ADD pdu2_serial NVARCHAR(255) NULL;
    PRINT '✅ Columna pdu2_serial añadida';
END
ELSE
BEGIN
    PRINT 'ℹ️  Columna pdu2_serial ya existe';
END

-- ============================================================================================================
-- PASO 3: Migrar datos existentes
-- ============================================================================================================

PRINT '';
PRINT 'Paso 3: Migrando datos existentes...';

-- Copiar pdu_id a pdu1_id para registros existentes que no tienen pdu1_id
UPDATE maintenance_rack_details
SET pdu1_id = pdu_id
WHERE pdu1_id IS NULL AND pdu_id IS NOT NULL;

DECLARE @updatedPduIds INT = @@ROWCOUNT;
PRINT '✅ ' + CAST(@updatedPduIds AS NVARCHAR(10)) + ' registros actualizados con pdu1_id';

-- Copiar serial a pdu1_serial para registros existentes que no tienen pdu1_serial
UPDATE maintenance_rack_details
SET pdu1_serial = serial
WHERE pdu1_serial IS NULL AND serial IS NOT NULL;

DECLARE @updatedSerials INT = @@ROWCOUNT;
PRINT '✅ ' + CAST(@updatedSerials AS NVARCHAR(10)) + ' registros actualizados con pdu1_serial';

-- ============================================================================================================
-- PASO 4: Crear índices para mejorar el rendimiento
-- ============================================================================================================

PRINT '';
PRINT 'Paso 4: Creando índices...';

-- Índice para pdu1_id
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_maintenance_rack_details_pdu1_id'
    AND object_id = OBJECT_ID('maintenance_rack_details')
)
BEGIN
    CREATE INDEX IX_maintenance_rack_details_pdu1_id
    ON maintenance_rack_details(pdu1_id)
    WHERE pdu1_id IS NOT NULL;
    PRINT '✅ Índice IX_maintenance_rack_details_pdu1_id creado';
END
ELSE
BEGIN
    PRINT 'ℹ️  Índice IX_maintenance_rack_details_pdu1_id ya existe';
END

-- Índice para pdu2_id
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_maintenance_rack_details_pdu2_id'
    AND object_id = OBJECT_ID('maintenance_rack_details')
)
BEGIN
    CREATE INDEX IX_maintenance_rack_details_pdu2_id
    ON maintenance_rack_details(pdu2_id)
    WHERE pdu2_id IS NOT NULL;
    PRINT '✅ Índice IX_maintenance_rack_details_pdu2_id creado';
END
ELSE
BEGIN
    PRINT 'ℹ️  Índice IX_maintenance_rack_details_pdu2_id ya existe';
END

-- ============================================================================================================
-- PASO 5: Resumen de cambios
-- ============================================================================================================

PRINT '';
PRINT '============================================================================================================';
PRINT 'RESUMEN DE CAMBIOS';
PRINT '============================================================================================================';

-- Contar registros con datos
DECLARE @totalRecords INT;
DECLARE @recordsWithPdu1 INT;
DECLARE @recordsWithPdu2 INT;

SELECT @totalRecords = COUNT(*) FROM maintenance_rack_details;
SELECT @recordsWithPdu1 = COUNT(*) FROM maintenance_rack_details WHERE pdu1_id IS NOT NULL;
SELECT @recordsWithPdu2 = COUNT(*) FROM maintenance_rack_details WHERE pdu2_id IS NOT NULL;

PRINT 'Estadísticas de la tabla maintenance_rack_details:';
PRINT '  - Total de registros: ' + CAST(@totalRecords AS NVARCHAR(10));
PRINT '  - Registros con PDU 1: ' + CAST(@recordsWithPdu1 AS NVARCHAR(10));
PRINT '  - Registros con PDU 2: ' + CAST(@recordsWithPdu2 AS NVARCHAR(10));
PRINT '';
PRINT '✅ Migración completada exitosamente';
PRINT '============================================================================================================';
PRINT '';

GO
