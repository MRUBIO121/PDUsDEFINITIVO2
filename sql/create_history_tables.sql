/*
  Tablas de Historico para Alertas y Mantenimiento
  Microsoft SQL Server - Windows Server 2019

  Este script crea las tablas de historico.
  Guarda un registro permanente de todas las alertas y mantenimientos,
  incluso despues de que se resuelvan o finalicen.

  1. Nuevas Tablas:
    - alerts_history: Historico de todas las alertas criticas
    - maintenance_history: Historico de todos los mantenimientos

  Ejecutar en: Microsoft SQL Server
*/

-- ============================================
-- TABLA: alerts_history
-- Historico permanente de todas las alertas
-- ============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'alerts_history')
BEGIN
    CREATE TABLE alerts_history (
        id INT IDENTITY(1,1) PRIMARY KEY,

        pdu_id NVARCHAR(255) NOT NULL,
        rack_id NVARCHAR(255) NOT NULL,
        name NVARCHAR(255),
        country NVARCHAR(100),
        site NVARCHAR(255),
        dc NVARCHAR(100),
        phase NVARCHAR(50),
        chain NVARCHAR(100),
        node NVARCHAR(100),
        serial NVARCHAR(255),

        metric_type NVARCHAR(50) NOT NULL,
        alert_reason NVARCHAR(500) NOT NULL,
        alert_value DECIMAL(18, 4),
        alert_field NVARCHAR(100),
        threshold_exceeded DECIMAL(18, 4),

        created_at DATETIME DEFAULT GETDATE(),
        resolved_at DATETIME,

        resolved_by NVARCHAR(255),
        resolution_type NVARCHAR(50) DEFAULT 'auto',

        duration_minutes INT
    );

    PRINT 'Tabla alerts_history creada correctamente';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_alerts_history_rack_id')
    CREATE INDEX IX_alerts_history_rack_id ON alerts_history(rack_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_alerts_history_site')
    CREATE INDEX IX_alerts_history_site ON alerts_history(site);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_alerts_history_created_at')
    CREATE INDEX IX_alerts_history_created_at ON alerts_history(created_at DESC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_alerts_history_resolved_at')
    CREATE INDEX IX_alerts_history_resolved_at ON alerts_history(resolved_at DESC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_alerts_history_pdu_metric')
    CREATE INDEX IX_alerts_history_pdu_metric ON alerts_history(pdu_id, metric_type);
GO


-- ============================================
-- TABLA: maintenance_history
-- Historico permanente de todos los mantenimientos
-- ============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'maintenance_history')
BEGIN
    CREATE TABLE maintenance_history (
        id INT IDENTITY(1,1) PRIMARY KEY,

        original_entry_id UNIQUEIDENTIFIER,

        entry_type NVARCHAR(50) NOT NULL,

        rack_id NVARCHAR(255) NOT NULL,
        rack_name NVARCHAR(255),
        country NVARCHAR(100),
        site NVARCHAR(255),
        dc NVARCHAR(100),
        phase NVARCHAR(50),
        chain NVARCHAR(100),
        node NVARCHAR(100),
        gwName NVARCHAR(255),
        gwIp NVARCHAR(50),

        reason NVARCHAR(500),

        started_by NVARCHAR(255),

        ended_by NVARCHAR(255),

        started_at DATETIME NOT NULL,
        ended_at DATETIME,
        created_at DATETIME DEFAULT GETDATE(),

        duration_minutes INT
    );

    PRINT 'Tabla maintenance_history creada correctamente';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_maintenance_history_rack_id')
    CREATE INDEX IX_maintenance_history_rack_id ON maintenance_history(rack_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_maintenance_history_site')
    CREATE INDEX IX_maintenance_history_site ON maintenance_history(site);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_maintenance_history_started_at')
    CREATE INDEX IX_maintenance_history_started_at ON maintenance_history(started_at DESC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_maintenance_history_ended_at')
    CREATE INDEX IX_maintenance_history_ended_at ON maintenance_history(ended_at DESC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_maintenance_history_chain')
    CREATE INDEX IX_maintenance_history_chain ON maintenance_history(chain);
GO

PRINT '';
PRINT 'Tablas de historico creadas: alerts_history, maintenance_history';
GO
