/*
  # Añadir campo 'user' a tabla maintenance_entries

  ## Descripción
  Esta migración añade un nuevo campo 'user' a la tabla maintenance_entries para almacenar
  el nombre del usuario que inició el mantenimiento de forma independiente del campo 'reason'.

  ## Cambios
  1. Se añade el campo 'user' (NVARCHAR(255)) a la tabla maintenance_entries
  2. Se migran los datos existentes del campo 'started_by' al nuevo campo 'user'
  3. Se crea un índice para optimizar búsquedas por usuario

  ## Notas
  - El campo 'started_by' se mantiene por compatibilidad pero 'user' será el campo principal
  - Los datos existentes se copian de 'started_by' a 'user'
  - El campo 'reason' ya no contendrá el formato "(Usuario) motivo"
*/

PRINT '';
PRINT '====================================================================================================';
PRINT 'MIGRACION: Añadir campo user a maintenance_entries';
PRINT '====================================================================================================';
PRINT '';

-- Paso 1: Verificar y añadir el campo 'user' si no existe
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'maintenance_entries'
    AND COLUMN_NAME = 'user'
)
BEGIN
    PRINT '🔧 Añadiendo campo "user" a la tabla maintenance_entries...';

    ALTER TABLE maintenance_entries
    ADD [user] NVARCHAR(255) NULL;

    PRINT '✅ Campo "user" añadido correctamente';
END
ELSE
BEGIN
    PRINT 'ℹ️  El campo "user" ya existe en maintenance_entries';
END
GO

-- Paso 2: Migrar datos existentes de 'started_by' a 'user'
IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'maintenance_entries'
    AND COLUMN_NAME = 'user'
)
BEGIN
    PRINT '📦 Migrando datos existentes de started_by a user...';

    UPDATE maintenance_entries
    SET [user] = started_by
    WHERE started_by IS NOT NULL AND [user] IS NULL;

    DECLARE @rowsAffected INT = @@ROWCOUNT;
    PRINT '✅ Datos migrados correctamente (' + CAST(@rowsAffected AS NVARCHAR(10)) + ' registros actualizados)';
END
GO

-- Paso 3: Crear índice para mejorar las búsquedas por usuario
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_maintenance_entries_user'
    AND object_id = OBJECT_ID('maintenance_entries')
)
BEGIN
    PRINT '📊 Creando índice IX_maintenance_entries_user...';

    CREATE INDEX IX_maintenance_entries_user ON maintenance_entries([user]);

    PRINT '✅ Índice IX_maintenance_entries_user creado';
END
ELSE
BEGIN
    PRINT 'ℹ️  El índice IX_maintenance_entries_user ya existe';
END
GO

PRINT '';
PRINT '====================================================================================================';
PRINT '✅ MIGRACIÓN COMPLETADA EXITOSAMENTE';
PRINT '';
PRINT 'Resumen de cambios:';
PRINT '  - Campo "user" añadido/verificado en maintenance_entries';
PRINT '  - Datos migrados desde started_by';
PRINT '  - Índice creado/verificado para mejorar rendimiento';
PRINT '====================================================================================================';
PRINT '';
GO
