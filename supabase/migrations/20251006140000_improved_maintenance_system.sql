/*
  # Sistema de Mantenimiento Mejorado

  1. Nueva Estructura
    - `maintenance_entries` - Tabla principal para entradas de mantenimiento
      - Soporta tanto racks individuales como chains completas
      - `id` (uniqueidentifier, primary key) - ID único de la entrada
      - `entry_type` (nvarchar) - Tipo: 'individual_rack' o 'chain'
      - `rack_id` (nvarchar) - ID del rack (para tipo individual)
      - `chain` (nvarchar) - Número de chain
      - `site` (nvarchar) - Sitio
      - `dc` (nvarchar) - Data center
      - `reason` (nvarchar) - Razón del mantenimiento
      - `started_at` (datetime) - Fecha de inicio
      - `started_by` (nvarchar) - Usuario que inició el mantenimiento
      - `created_at` (datetime) - Timestamp de creación

    - `maintenance_rack_details` - Detalles de cada rack en mantenimiento
      - `id` (uniqueidentifier, primary key)
      - `maintenance_entry_id` (uniqueidentifier, foreign key) - Referencia a maintenance_entries
      - `rack_id` (nvarchar) - ID del rack
      - `pdu_id` (nvarchar) - ID del PDU
      - `name` (nvarchar) - Nombre del rack/PDU
      - `country` (nvarchar) - País
      - `site` (nvarchar) - Sitio
      - `dc` (nvarchar) - Data center
      - `phase` (nvarchar) - Fase
      - `chain` (nvarchar) - Chain
      - `node` (nvarchar) - Nodo
      - `serial` (nvarchar) - Número de serie
      - `created_at` (datetime) - Timestamp de creación

  2. Ventajas del Nuevo Sistema
    - Permite agrupar racks por entrada de mantenimiento
    - Facilita eliminar todos los racks de una chain de una sola vez
    - Permite eliminar racks individuales sin afectar otros de la misma chain
    - Mantiene historial completo de qué se puso en mantenimiento y cuándo
    - Diferencia entre mantenimiento de rack individual vs chain completa

  3. Índices
    - Índices en campos clave para búsquedas rápidas
    - Índices en foreign keys para joins eficientes
*/

-- Usar la base de datos energy_monitor_db
USE energy_monitor_db;
GO

-- ============================================
-- Paso 1: Crear la tabla maintenance_entries
-- ============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_entries' AND xtype='U')
BEGIN
    CREATE TABLE maintenance_entries (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        entry_type NVARCHAR(50) NOT NULL CHECK (entry_type IN ('individual_rack', 'chain')),
        rack_id NVARCHAR(255) NULL, -- Solo para tipo 'individual_rack'
        chain NVARCHAR(255) NULL,
        site NVARCHAR(255) NULL,
        dc NVARCHAR(255) NOT NULL,
        reason NVARCHAR(MAX),
        started_at DATETIME DEFAULT GETDATE(),
        started_by NVARCHAR(255),
        created_at DATETIME DEFAULT GETDATE()
    );

    -- Crear índices para performance
    CREATE INDEX IX_maintenance_entries_type ON maintenance_entries(entry_type);
    CREATE INDEX IX_maintenance_entries_rack_id ON maintenance_entries(rack_id);
    CREATE INDEX IX_maintenance_entries_chain_dc ON maintenance_entries(chain, dc);
    CREATE INDEX IX_maintenance_entries_dc ON maintenance_entries(dc);
    CREATE INDEX IX_maintenance_entries_started_at ON maintenance_entries(started_at);

    PRINT '✅ Tabla maintenance_entries creada con índices';
END
ELSE
BEGIN
    PRINT '⚠️ Tabla maintenance_entries ya existe';
END
GO

-- ============================================
-- Paso 2: Crear la tabla maintenance_rack_details
-- ============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_rack_details' AND xtype='U')
BEGIN
    CREATE TABLE maintenance_rack_details (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        maintenance_entry_id UNIQUEIDENTIFIER NOT NULL,
        rack_id NVARCHAR(255) NOT NULL,
        pdu_id NVARCHAR(255),
        name NVARCHAR(500),
        country NVARCHAR(255),
        site NVARCHAR(255),
        dc NVARCHAR(255),
        phase NVARCHAR(100),
        chain NVARCHAR(255),
        node NVARCHAR(255),
        serial NVARCHAR(255),
        created_at DATETIME DEFAULT GETDATE(),

        -- Foreign key a maintenance_entries
        CONSTRAINT FK_maintenance_rack_details_entry
            FOREIGN KEY (maintenance_entry_id)
            REFERENCES maintenance_entries(id)
            ON DELETE CASCADE,

        -- Constraint para evitar duplicados del mismo rack en la misma entrada
        CONSTRAINT UK_maintenance_rack_details_entry_rack
            UNIQUE (maintenance_entry_id, rack_id)
    );

    -- Crear índices para performance
    CREATE INDEX IX_maintenance_rack_details_entry_id ON maintenance_rack_details(maintenance_entry_id);
    CREATE INDEX IX_maintenance_rack_details_rack_id ON maintenance_rack_details(rack_id);
    CREATE INDEX IX_maintenance_rack_details_chain_dc ON maintenance_rack_details(chain, dc);

    PRINT '✅ Tabla maintenance_rack_details creada con índices y constraints';
END
ELSE
BEGIN
    PRINT '⚠️ Tabla maintenance_rack_details ya existe';
END
GO

-- ============================================
-- Paso 3: Migrar datos de maintenance_racks (si existe)
-- ============================================
IF EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_racks' AND xtype='U')
BEGIN
    PRINT '🔄 Migrando datos de maintenance_racks a nueva estructura...';

    -- Migrar cada rack como entrada individual
    DECLARE @rack_cursor CURSOR;
    DECLARE @rack_id NVARCHAR(255);
    DECLARE @chain NVARCHAR(255);
    DECLARE @pdu_id NVARCHAR(255);
    DECLARE @name NVARCHAR(500);
    DECLARE @country NVARCHAR(255);
    DECLARE @site NVARCHAR(255);
    DECLARE @dc NVARCHAR(255);
    DECLARE @phase NVARCHAR(100);
    DECLARE @node NVARCHAR(255);
    DECLARE @serial NVARCHAR(255);
    DECLARE @reason NVARCHAR(MAX);
    DECLARE @started_at DATETIME;
    DECLARE @started_by NVARCHAR(255);
    DECLARE @created_at DATETIME;
    DECLARE @new_entry_id UNIQUEIDENTIFIER;

    SET @rack_cursor = CURSOR FOR
    SELECT rack_id, chain, pdu_id, name, country, site, dc, phase, node, serial, reason, started_at, started_by, created_at
    FROM maintenance_racks;

    OPEN @rack_cursor;
    FETCH NEXT FROM @rack_cursor INTO @rack_id, @chain, @pdu_id, @name, @country, @site, @dc, @phase, @node, @serial, @reason, @started_at, @started_by, @created_at;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Crear nueva entrada de mantenimiento individual
        SET @new_entry_id = NEWID();

        INSERT INTO maintenance_entries (id, entry_type, rack_id, chain, site, dc, reason, started_at, started_by, created_at)
        VALUES (@new_entry_id, 'individual_rack', @rack_id, @chain, @site, @dc, @reason, @started_at, @started_by, @created_at);

        -- Insertar detalles del rack
        INSERT INTO maintenance_rack_details (maintenance_entry_id, rack_id, pdu_id, name, country, site, dc, phase, chain, node, serial, created_at)
        VALUES (@new_entry_id, @rack_id, @pdu_id, @name, @country, @site, @dc, @phase, @chain, @node, @serial, @created_at);

        FETCH NEXT FROM @rack_cursor INTO @rack_id, @chain, @pdu_id, @name, @country, @site, @dc, @phase, @node, @serial, @reason, @started_at, @started_by, @created_at;
    END

    CLOSE @rack_cursor;
    DEALLOCATE @rack_cursor;

    PRINT '✅ Datos migrados exitosamente';

    -- Renombrar la tabla antigua para mantener backup
    EXEC sp_rename 'maintenance_racks', 'maintenance_racks_old_backup';
    PRINT '✅ Tabla antigua renombrada a maintenance_racks_old_backup';
END
ELSE
BEGIN
    PRINT 'ℹ️ No hay tabla maintenance_racks para migrar';
END
GO

PRINT '============================================';
PRINT 'Sistema de mantenimiento mejorado instalado correctamente';
PRINT '============================================';
GO
