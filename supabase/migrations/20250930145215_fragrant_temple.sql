-- ============================================
-- Setup completo de base de datos para Energy Monitoring System
-- ============================================

-- Crear la base de datos si no existe
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'energy_monitor_db')
BEGIN
    CREATE DATABASE energy_monitor_db;
    PRINT '✅ Base de datos energy_monitor_db creada';
END
ELSE
BEGIN
    PRINT '✅ Base de datos energy_monitor_db ya existe';
END
GO

-- Cambiar al contexto de la base de datos
USE energy_monitor_db;
GO

-- ============================================
-- 1. Tabla de configuración de umbrales globales
-- ============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='threshold_configs' AND xtype='U')
BEGIN
    CREATE TABLE threshold_configs (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        threshold_key NVARCHAR(255) UNIQUE NOT NULL,
        value DECIMAL(18, 4) NOT NULL,
        unit NVARCHAR(50),
        description NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    PRINT '✅ Tabla threshold_configs creada';
END
ELSE
BEGIN
    PRINT '✅ Tabla threshold_configs ya existe';
END
GO

-- ============================================
-- 2. Insertar umbrales por defecto
-- ============================================
MERGE threshold_configs AS target
USING (VALUES 
    -- Temperature thresholds
    ('critical_temperature_low', 5.0, 'C', 'Critical low temperature threshold'),
    ('critical_temperature_high', 40.0, 'C', 'Critical high temperature threshold'),
    ('warning_temperature_low', 10.0, 'C', 'Warning low temperature threshold'),
    ('warning_temperature_high', 30.0, 'C', 'Warning high temperature threshold'),
    
    -- Humidity thresholds
    ('critical_humidity_low', 20.0, '%', 'Critical low humidity threshold'),
    ('critical_humidity_high', 80.0, '%', 'Critical high humidity threshold'),
    ('warning_humidity_low', 30.0, '%', 'Warning low humidity threshold'),
    ('warning_humidity_high', 70.0, '%', 'Warning high humidity threshold'),
    
    -- Amperage thresholds - Single Phase
    ('critical_amperage_low_single_phase', 1.0, 'A', 'Critical low amperage threshold for Single Phase'),
    ('critical_amperage_high_single_phase', 25.0, 'A', 'Critical high amperage threshold for Single Phase'),
    ('warning_amperage_low_single_phase', 2.0, 'A', 'Warning low amperage threshold for Single Phase'),
    ('warning_amperage_high_single_phase', 20.0, 'A', 'Warning high amperage threshold for Single Phase'),
    
    -- Amperage thresholds - 3-Phase
    ('critical_amperage_low_3_phase', 1.0, 'A', 'Critical low amperage threshold for 3-Phase'),
    ('critical_amperage_high_3_phase', 30.0, 'A', 'Critical high amperage threshold for 3-Phase'),
    ('warning_amperage_low_3_phase', 2.0, 'A', 'Warning low amperage threshold for 3-Phase'),
    ('warning_amperage_high_3_phase', 25.0, 'A', 'Warning high amperage threshold for 3-Phase'),
    
    -- Voltage thresholds
    ('critical_voltage_low', 200.0, 'V', 'Critical low voltage threshold'),
    ('critical_voltage_high', 250.0, 'V', 'Critical high voltage threshold'),
    ('warning_voltage_low', 210.0, 'V', 'Warning low voltage threshold'),
    ('warning_voltage_high', 240.0, 'V', 'Warning high voltage threshold'),
    
    -- Power thresholds
    ('critical_power_high', 5000.0, 'W', 'Critical high power threshold'),
    ('warning_power_high', 4000.0, 'W', 'Warning high power threshold')
) AS source (threshold_key, value, unit, description)
ON target.threshold_key = source.threshold_key
WHEN MATCHED THEN 
    UPDATE SET value = source.value, unit = source.unit, description = source.description, updated_at = GETDATE()
WHEN NOT MATCHED THEN 
    INSERT (threshold_key, value, unit, description) 
    VALUES (source.threshold_key, source.value, source.unit, source.description);

PRINT '✅ Umbrales por defecto insertados/actualizados';
GO

-- ============================================
-- 3. Tabla de umbrales específicos por rack
-- ============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='rack_threshold_overrides' AND xtype='U')
BEGIN
    CREATE TABLE rack_threshold_overrides (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        rack_id NVARCHAR(255) NOT NULL,
        threshold_key NVARCHAR(255) NOT NULL,
        value DECIMAL(18, 4) NOT NULL,
        unit NVARCHAR(50),
        description NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        
        -- Unique constraint to prevent duplicate thresholds for the same rack
        CONSTRAINT UK_rack_threshold_overrides_rack_key UNIQUE (rack_id, threshold_key)
    );

    -- Create indexes for performance
    CREATE INDEX IX_rack_threshold_overrides_rack_id ON rack_threshold_overrides(rack_id);
    CREATE INDEX IX_rack_threshold_overrides_threshold_key ON rack_threshold_overrides(threshold_key);
    CREATE INDEX IX_rack_threshold_overrides_created_at ON rack_threshold_overrides(created_at);
    
    PRINT '✅ Tabla rack_threshold_overrides creada con índices';
END
ELSE
BEGIN
    PRINT '✅ Tabla rack_threshold_overrides ya existe';
END
GO

-- ============================================
-- 4. Tabla de alertas activas
-- ============================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='active_critical_alerts' AND xtype='U')
BEGIN
    CREATE TABLE active_critical_alerts (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        pdu_id NVARCHAR(255) NOT NULL,
        rack_id NVARCHAR(255),
        name NVARCHAR(500),
        country NVARCHAR(255),
        site NVARCHAR(255),
        dc NVARCHAR(255),
        phase NVARCHAR(100),
        chain NVARCHAR(255),
        node NVARCHAR(255),
        serial NVARCHAR(255),
        alert_type NVARCHAR(50) NOT NULL DEFAULT 'critical',
        metric_type NVARCHAR(50) NOT NULL,
        alert_reason NVARCHAR(255) NOT NULL,
        alert_value DECIMAL(18, 4),
        alert_field NVARCHAR(100),
        threshold_exceeded DECIMAL(18, 4),
        alert_started_at DATETIME DEFAULT GETDATE(),
        last_updated_at DATETIME DEFAULT GETDATE(),
        
        -- Unique constraint to prevent duplicate metric alerts per PDU
        CONSTRAINT UK_active_critical_alerts_pdu_metric UNIQUE (pdu_id, metric_type, alert_reason)
    );

    -- Create indexes for performance
    CREATE INDEX IX_active_critical_alerts_pdu_id ON active_critical_alerts(pdu_id);
    CREATE INDEX IX_active_critical_alerts_alert_started_at ON active_critical_alerts(alert_started_at);
    CREATE INDEX IX_active_critical_alerts_metric_type ON active_critical_alerts(metric_type);
    CREATE INDEX IX_active_critical_alerts_alert_type ON active_critical_alerts(alert_type);
    CREATE INDEX IX_active_critical_alerts_site ON active_critical_alerts(site);
    CREATE INDEX IX_active_critical_alerts_dc ON active_critical_alerts(dc);
    CREATE INDEX IX_active_critical_alerts_last_updated ON active_critical_alerts(last_updated_at);
    
    PRINT '✅ Tabla active_critical_alerts creada con índices';
END
ELSE
BEGIN
    PRINT '✅ Tabla active_critical_alerts ya existe';
END
GO

-- ============================================
-- 5. Verificación final
-- ============================================
PRINT '============================================';
PRINT 'Setup de base de datos completado';
PRINT '============================================';

-- Mostrar resumen de tablas creadas
SELECT 
    'threshold_configs' as tabla,
    COUNT(*) as registros
FROM threshold_configs
UNION ALL
SELECT 
    'rack_threshold_overrides' as tabla,
    COUNT(*) as registros
FROM rack_threshold_overrides
UNION ALL
SELECT 
    'active_critical_alerts' as tabla,
    COUNT(*) as registros
FROM active_critical_alerts;

PRINT '✅ Base de datos lista para usar';
GO