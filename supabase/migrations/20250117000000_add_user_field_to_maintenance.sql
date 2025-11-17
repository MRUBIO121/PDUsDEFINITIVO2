/*
  # Añadir campo 'user' a tabla maintenance_entries

  ## Descripción
  Esta migración añade un nuevo campo 'user' a la tabla maintenance_entries para almacenar
  el nombre del usuario que inició el mantenimiento de forma independiente del campo 'reason'.

  ## Cambios
  1. Se añade el campo 'user' (NVARCHAR(255)) a la tabla maintenance_entries
  2. Se migran los datos existentes del campo 'started_by' al nuevo campo 'user'
  3. El campo 'user' será obligatorio para nuevas entradas

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

-- Verificar si el campo 'user' ya existe
IF NOT EXISTS (
    SELECT *
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'maintenance_entries'
    AND COLUMN_NAME = 'user'
)
BEGIN
    PRINT '🔧 Añadiendo campo "user" a la tabla maintenance_entries...';

    -- Añadir el campo 'user' (inicialmente permite NULL)
    ALTER TABLE maintenance_entries
    ADD [user] NVARCHAR(255) NULL;

    PRINT '✅ Campo "user" añadido correctamente';

    -- Migrar datos existentes de 'started_by' a 'user'
    PRINT '📦 Migrando datos existentes de started_by a user...';

    UPDATE maintenance_entries
    SET [user] = started_by
    WHERE started_by IS NOT NULL;

    PRINT '✅ Datos migrados correctamente';

    -- Crear un índice para mejorar las búsquedas por usuario
    IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE name = 'IX_maintenance_entries_user'
        AND object_id = OBJECT_ID('maintenance_entries')
    )
    BEGIN
        CREATE INDEX IX_maintenance_entries_user ON maintenance_entries([user]);
        PRINT '✅ Índice IX_maintenance_entries_user creado';
    END

    PRINT '';
    PRINT '✅ Migración completada exitosamente';
    PRINT '   - Campo "user" añadido';
    PRINT '   - Datos migrados desde started_by';
    PRINT '   - Índice creado para mejorar rendimiento';
END
ELSE
BEGIN
    PRINT 'ℹ️  El campo "user" ya existe en maintenance_entries';
END

PRINT '';
PRINT '====================================================================================================';
GO
