/*
  # Maintenance Mode Table

  1. New Tables
    - `maintenance_racks`
      - `id` (uniqueidentifier, primary key)
      - `rack_id` (nvarchar, unique) - The rack identifier
      - `chain` (nvarchar) - The chain the rack belongs to
      - `pdu_id` (nvarchar) - Associated PDU ID
      - `name` (nvarchar) - Rack/PDU name
      - `country` (nvarchar) - Country location
      - `site` (nvarchar) - Site location
      - `dc` (nvarchar) - Data center location
      - `phase` (nvarchar) - Phase information
      - `node` (nvarchar) - Node information
      - `serial` (nvarchar) - Serial number
      - `reason` (nvarchar) - Reason for maintenance
      - `started_at` (datetime) - When maintenance started
      - `started_by` (nvarchar) - Who initiated maintenance
      - `created_at` (datetime) - Record creation timestamp

  2. Security
    - Indexes for performance on rack_id, chain, and started_at

  3. Purpose
    - Tracks racks and PDUs currently under maintenance
    - Excludes maintenance items from alert calculations
    - Groups by chain for bulk operations
*/

-- Use the energy_monitor_db database
USE energy_monitor_db;
GO

-- Create maintenance_racks table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_racks' AND xtype='U')
BEGIN
    CREATE TABLE maintenance_racks (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        rack_id NVARCHAR(255) NOT NULL,
        chain NVARCHAR(255),
        pdu_id NVARCHAR(255),
        name NVARCHAR(500),
        country NVARCHAR(255),
        site NVARCHAR(255),
        dc NVARCHAR(255),
        phase NVARCHAR(100),
        node NVARCHAR(255),
        serial NVARCHAR(255),
        reason NVARCHAR(MAX),
        started_at DATETIME DEFAULT GETDATE(),
        started_by NVARCHAR(255),
        created_at DATETIME DEFAULT GETDATE(),

        -- Unique constraint to prevent duplicate maintenance entries
        CONSTRAINT UK_maintenance_racks_rack_id UNIQUE (rack_id)
    );

    -- Create indexes for performance
    CREATE INDEX IX_maintenance_racks_rack_id ON maintenance_racks(rack_id);
    CREATE INDEX IX_maintenance_racks_chain ON maintenance_racks(chain);
    CREATE INDEX IX_maintenance_racks_started_at ON maintenance_racks(started_at);
    CREATE INDEX IX_maintenance_racks_site ON maintenance_racks(site);
    CREATE INDEX IX_maintenance_racks_dc ON maintenance_racks(dc);

    PRINT '✅ Tabla maintenance_racks creada con índices';
END
ELSE
BEGIN
    PRINT '✅ Tabla maintenance_racks ya existe';
END
GO

PRINT '============================================';
PRINT 'Maintenance mode table setup completed';
PRINT '============================================';
GO
