-- ============================================================================================================
-- MIGRACIÓN: Añadir campos gwName y gwIp a maintenance_rack_details
-- ============================================================================================================
-- PROPOSITO: Almacenar información del gateway asociado a cada rack en mantenimiento
--
-- DESCRIPCION:
--   Esta migración añade dos nuevos campos a la tabla maintenance_rack_details para almacenar
--   el nombre y la IP del gateway al que pertenece cada rack.
--
-- CAMBIOS:
--   1. Se añade el campo 'gwName' (NVARCHAR(255)) para almacenar el nombre del gateway
--   2. Se añade el campo 'gwIp' (NVARCHAR(50)) para almacenar la dirección IP del gateway
--
-- RAZON:
--   Permitir que la interfaz de mantenimiento muestre información completa del gateway
--   sin necesidad de realizar consultas adicionales a otras tablas o sistemas.
--
-- FECHA: 2025-01-19
-- ============================================================================================================

PRINT '';
PRINT '============================================================================================================';
PRINT 'AGREGANDO CAMPOS DE GATEWAY A maintenance_rack_details';
PRINT '============================================================================================================';

-- Agregar campo gwName si no existe
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('maintenance_rack_details')
    AND name = 'gwName'
)
BEGIN
    ALTER TABLE maintenance_rack_details
    ADD gwName NVARCHAR(255) NULL;
    PRINT '✅ Campo gwName añadido a maintenance_rack_details';
END
ELSE
BEGIN
    PRINT 'ℹ️  Campo gwName ya existe en maintenance_rack_details';
END

-- Agregar campo gwIp si no existe
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('maintenance_rack_details')
    AND name = 'gwIp'
)
BEGIN
    ALTER TABLE maintenance_rack_details
    ADD gwIp NVARCHAR(50) NULL;
    PRINT '✅ Campo gwIp añadido a maintenance_rack_details';
END
ELSE
BEGIN
    PRINT 'ℹ️  Campo gwIp ya existe en maintenance_rack_details';
END

PRINT '';
PRINT '✅ Migración completada - Campos de gateway configurados correctamente';
PRINT '============================================================================================================';
PRINT '';
GO
