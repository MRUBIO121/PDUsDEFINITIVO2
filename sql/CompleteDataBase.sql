-- ============================================================================================================
-- ARCHIVO: CompleteDataBase.sql
-- PROPOSITO: Setup completo consolidado de toda la base de datos del sistema de monitoreo de energia
-- VERSION: 6.0 - Archivo unificado con TODOS los scripts SQL del proyecto
-- ============================================================================================================
--
-- Este script consolidado incluye:
--   1. Creacion de base de datos
--   2. Todas las tablas del sistema (umbrales, alertas, mantenimiento, usuarios, historicos)
--   3. Configuracion de umbrales con soporte completo de voltaje
--   4. Sistema de usuarios con roles y permisos
--   5. Tablas de historico para alertas y mantenimientos
--   6. Datos iniciales (umbrales por defecto, usuario admin)
--   7. Campos gateway (gwName, gwIp) en alertas e historicos
--   8. Campo [group] en alertas e historicos
--
-- TABLAS INCLUIDAS:
--   1. threshold_configs           - Umbrales globales de todas las metricas
--   2. rack_threshold_overrides    - Umbrales especificos por rack
--   3. active_critical_alerts      - Alertas criticas activas en tiempo real
--   4. maintenance_entries         - Entradas de mantenimiento (racks o chains completas)
--   5. maintenance_rack_details    - Detalles de cada rack en mantenimiento
--   6. usersAlertado               - Usuarios del sistema con roles y permisos
--   7. alerts_history              - Historico permanente de todas las alertas
--   8. maintenance_history         - Historico permanente de todos los mantenimientos
--
-- ============================================================================================================

-- ============================================================================================================
-- PASO 1: Crear la base de datos si no existe
-- ============================================================================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'energy_monitor_db')
BEGIN
    CREATE DATABASE energy_monitor_db;
    PRINT 'Base de datos energy_monitor_db creada';
END
ELSE
BEGIN
    PRINT 'Base de datos energy_monitor_db ya existe';
END
GO

USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================================================';
PRINT 'INICIO: Configuracion completa del sistema de monitoreo de energia';
PRINT '============================================================================================================';
PRINT '';

-- ============================================================================================================
-- TABLA 1: threshold_configs
-- Almacena los umbrales globales para todas las metricas del sistema
-- ============================================================================================================

PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: threshold_configs';
PRINT '------------------------------------------------------------------------------------------------------------';

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
    PRINT 'Tabla threshold_configs creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla threshold_configs ya existe';
END
GO

-- ============================================================================================================
-- INSERTAR/ACTUALIZAR UMBRALES POR DEFECTO
-- ============================================================================================================

PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Insertando/actualizando umbrales por defecto';
PRINT '------------------------------------------------------------------------------------------------------------';

MERGE threshold_configs AS target
USING (VALUES
    ('critical_temperature_low', 5.0, 'C', 'Temperatura critica minima - Por debajo puede causar condensacion'),
    ('critical_temperature_high', 40.0, 'C', 'Temperatura critica maxima - Puede dañar equipos'),
    ('warning_temperature_low', 10.0, 'C', 'Temperatura advertencia minima - Fuera del rango optimo'),
    ('warning_temperature_high', 30.0, 'C', 'Temperatura advertencia maxima - Fuera del rango optimo'),

    ('critical_humidity_low', 20.0, '%', 'Humedad critica minima - Riesgo de electricidad estatica'),
    ('critical_humidity_high', 80.0, '%', 'Humedad critica maxima - Riesgo de condensacion'),
    ('warning_humidity_low', 30.0, '%', 'Humedad advertencia minima - Fuera del rango optimo'),
    ('warning_humidity_high', 70.0, '%', 'Humedad advertencia maxima - Fuera del rango optimo'),

    ('critical_amperage_low_single_phase', 1.0, 'A', 'Amperaje critico minimo monofasico - Posible desconexion'),
    ('critical_amperage_high_single_phase', 25.0, 'A', 'Amperaje critico maximo monofasico - Sobrecarga'),
    ('warning_amperage_low_single_phase', 2.0, 'A', 'Amperaje advertencia minimo monofasico - Consumo bajo'),
    ('warning_amperage_high_single_phase', 20.0, 'A', 'Amperaje advertencia maximo monofasico - Acercandose al limite'),

    ('critical_amperage_low_3_phase', 1.0, 'A', 'Amperaje critico minimo trifasico - Posible desconexion'),
    ('critical_amperage_high_3_phase', 30.0, 'A', 'Amperaje critico maximo trifasico - Sobrecarga'),
    ('warning_amperage_low_3_phase', 2.0, 'A', 'Amperaje advertencia minimo trifasico - Consumo bajo'),
    ('warning_amperage_high_3_phase', 25.0, 'A', 'Amperaje advertencia maximo trifasico - Acercandose al limite'),

    ('critical_voltage_low', 0.0, 'V', 'Voltaje critico minimo - 0V indica ausencia total de energia'),
    ('critical_voltage_high', 250.0, 'V', 'Voltaje critico maximo - Riesgo de dano a equipos'),
    ('warning_voltage_low', 0.0, 'V', 'Voltaje advertencia minimo - 0V indica ausencia total de energia'),
    ('warning_voltage_high', 240.0, 'V', 'Voltaje advertencia maximo - Fuera del rango nominal'),

    ('critical_power_high', 5000.0, 'W', 'Potencia critica maxima - Sobrecarga del PDU'),
    ('warning_power_high', 4000.0, 'W', 'Potencia advertencia maxima - Acercandose al limite del PDU')
) AS source (threshold_key, value, unit, description)
ON target.threshold_key = source.threshold_key
WHEN MATCHED THEN
    UPDATE SET
        value = source.value,
        unit = source.unit,
        description = source.description,
        updated_at = GETDATE()
WHEN NOT MATCHED THEN
    INSERT (threshold_key, value, unit, description)
    VALUES (source.threshold_key, source.value, source.unit, source.description);

PRINT 'Umbrales por defecto insertados/actualizados';
GO

-- ============================================================================================================
-- TABLA 2: rack_threshold_overrides
-- Almacena umbrales especificos para racks individuales
-- ============================================================================================================

PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: rack_threshold_overrides';
PRINT '------------------------------------------------------------------------------------------------------------';

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
        CONSTRAINT UK_rack_threshold_overrides_rack_key UNIQUE (rack_id, threshold_key)
    );

    CREATE INDEX IX_rack_threshold_overrides_rack_id ON rack_threshold_overrides(rack_id);
    CREATE INDEX IX_rack_threshold_overrides_threshold_key ON rack_threshold_overrides(threshold_key);
    CREATE INDEX IX_rack_threshold_overrides_created_at ON rack_threshold_overrides(created_at);

    PRINT 'Tabla rack_threshold_overrides creada con indices';
END
ELSE
BEGIN
    PRINT 'Tabla rack_threshold_overrides ya existe';
END
GO

-- ============================================================================================================
-- TABLA 3: active_critical_alerts
-- Almacena SOLO las alertas criticas actualmente activas
-- Incluye campos: gwName, gwIp, [group], uuid_open, uuid_closed
-- ============================================================================================================

PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: active_critical_alerts';
PRINT '------------------------------------------------------------------------------------------------------------';

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
        uuid_open NVARCHAR(255) NULL,
        uuid_closed NVARCHAR(255) NULL,
        gwName NVARCHAR(255) NULL,
        gwIp NVARCHAR(50) NULL,
        [group] NVARCHAR(100) NULL,
        CONSTRAINT UK_active_critical_alerts_pdu_metric UNIQUE (pdu_id, metric_type, alert_reason)
    );

    CREATE INDEX IX_active_critical_alerts_pdu_id ON active_critical_alerts(pdu_id);
    CREATE INDEX IX_active_critical_alerts_alert_started_at ON active_critical_alerts(alert_started_at);
    CREATE INDEX IX_active_critical_alerts_metric_type ON active_critical_alerts(metric_type);
    CREATE INDEX IX_active_critical_alerts_alert_type ON active_critical_alerts(alert_type);
    CREATE INDEX IX_active_critical_alerts_site ON active_critical_alerts(site);
    CREATE INDEX IX_active_critical_alerts_dc ON active_critical_alerts(dc);
    CREATE INDEX IX_active_critical_alerts_last_updated ON active_critical_alerts(last_updated_at);
    CREATE INDEX IX_active_critical_alerts_uuid_open ON active_critical_alerts(uuid_open);
    CREATE INDEX IX_active_critical_alerts_uuid_closed ON active_critical_alerts(uuid_closed);

    PRINT 'Tabla active_critical_alerts creada con indices';
END
ELSE
BEGIN
    PRINT 'Tabla active_critical_alerts ya existe';

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('active_critical_alerts') AND name = 'uuid_open')
    BEGIN
        ALTER TABLE active_critical_alerts ADD uuid_open NVARCHAR(255) NULL;
        PRINT 'Campo uuid_open agregado a active_critical_alerts';
    END

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('active_critical_alerts') AND name = 'uuid_closed')
    BEGIN
        ALTER TABLE active_critical_alerts ADD uuid_closed NVARCHAR(255) NULL;
        PRINT 'Campo uuid_closed agregado a active_critical_alerts';
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'gwName')
    BEGIN
        ALTER TABLE dbo.active_critical_alerts ADD gwName NVARCHAR(255) NULL;
        PRINT 'Campo gwName agregado a active_critical_alerts';
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'gwIp')
    BEGIN
        ALTER TABLE dbo.active_critical_alerts ADD gwIp NVARCHAR(50) NULL;
        PRINT 'Campo gwIp agregado a active_critical_alerts';
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'group')
    BEGIN
        ALTER TABLE dbo.active_critical_alerts ADD [group] NVARCHAR(100) NULL;
        PRINT 'Campo [group] agregado a active_critical_alerts';
    END
END
GO

-- Crear indices de uuid si no existen (para tablas ya existentes)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_active_critical_alerts_uuid_open')
    CREATE INDEX IX_active_critical_alerts_uuid_open ON active_critical_alerts(uuid_open);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_active_critical_alerts_uuid_closed')
    CREATE INDEX IX_active_critical_alerts_uuid_closed ON active_critical_alerts(uuid_closed);
GO

-- Actualizar registros existentes de active_critical_alerts con el campo [group] basado en site
UPDATE dbo.active_critical_alerts
SET [group] = CASE
    WHEN LOWER(site) LIKE '%cantabria%' THEN 'GTH_IN_ES_DCaaS_DC_H&E_Cantabria'
    WHEN LOWER(site) LIKE '%boadilla%' THEN 'GTH_IN_ES_DCaaS_DC_H&E_Boadilla'
    ELSE ''
END
WHERE [group] IS NULL;
PRINT 'Registros existentes actualizados en active_critical_alerts con campo [group]';
GO

-- ============================================================================================================
-- TABLA 4: maintenance_entries
-- Almacena las entradas principales de mantenimiento
-- ============================================================================================================

PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: maintenance_entries';
PRINT '------------------------------------------------------------------------------------------------------------';

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_entries' AND xtype='U')
BEGIN
    CREATE TABLE maintenance_entries (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        entry_type NVARCHAR(50) NOT NULL CHECK (entry_type IN ('individual_rack', 'chain')),
        rack_id NVARCHAR(255) NULL,
        chain NVARCHAR(255) NULL,
        site NVARCHAR(255) NULL,
        dc NVARCHAR(255) NOT NULL,
        reason NVARCHAR(MAX),
        started_at DATETIME DEFAULT GETDATE(),
        started_by NVARCHAR(255),
        [user] NVARCHAR(255) NULL,
        created_at DATETIME DEFAULT GETDATE()
    );

    CREATE INDEX IX_maintenance_entries_type ON maintenance_entries(entry_type);
    CREATE INDEX IX_maintenance_entries_rack_id ON maintenance_entries(rack_id);
    CREATE INDEX IX_maintenance_entries_chain_dc ON maintenance_entries(chain, dc);
    CREATE INDEX IX_maintenance_entries_dc ON maintenance_entries(dc);
    CREATE INDEX IX_maintenance_entries_started_at ON maintenance_entries(started_at);
    CREATE INDEX IX_maintenance_entries_user ON maintenance_entries([user]);

    PRINT 'Tabla maintenance_entries creada con indices';
END
ELSE
BEGIN
    PRINT 'Tabla maintenance_entries ya existe';

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('maintenance_entries') AND name = 'user')
    BEGIN
        ALTER TABLE maintenance_entries ADD [user] NVARCHAR(255) NULL;
        UPDATE maintenance_entries SET [user] = started_by WHERE started_by IS NOT NULL AND [user] IS NULL;
        CREATE INDEX IX_maintenance_entries_user ON maintenance_entries([user]);
        PRINT 'Campo user agregado y datos migrados desde started_by';
    END
END
GO

-- ============================================================================================================
-- TABLA 5: maintenance_rack_details
-- Almacena los detalles de cada rack individual en mantenimiento
-- ============================================================================================================

PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: maintenance_rack_details';
PRINT '------------------------------------------------------------------------------------------------------------';

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
        gwName NVARCHAR(255) NULL,
        gwIp NVARCHAR(50) NULL,
        created_at DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_maintenance_rack_details_entry
            FOREIGN KEY (maintenance_entry_id)
            REFERENCES maintenance_entries(id)
            ON DELETE CASCADE,
        CONSTRAINT UK_maintenance_rack_details_entry_rack
            UNIQUE (maintenance_entry_id, rack_id)
    );

    CREATE INDEX IX_maintenance_rack_details_entry_id ON maintenance_rack_details(maintenance_entry_id);
    CREATE INDEX IX_maintenance_rack_details_rack_id ON maintenance_rack_details(rack_id);
    CREATE INDEX IX_maintenance_rack_details_chain_dc ON maintenance_rack_details(chain, dc);

    PRINT 'Tabla maintenance_rack_details creada con indices y constraints';
END
ELSE
BEGIN
    PRINT 'Tabla maintenance_rack_details ya existe';

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('maintenance_rack_details') AND name = 'gwName')
    BEGIN
        ALTER TABLE maintenance_rack_details ADD gwName NVARCHAR(255) NULL;
        PRINT 'Campo gwName agregado a maintenance_rack_details';
    END

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('maintenance_rack_details') AND name = 'gwIp')
    BEGIN
        ALTER TABLE maintenance_rack_details ADD gwIp NVARCHAR(50) NULL;
        PRINT 'Campo gwIp agregado a maintenance_rack_details';
    END
END
GO

-- ============================================================================================================
-- TABLA 6: usersAlertado
-- Almacena los usuarios del sistema con sus credenciales y roles
-- ============================================================================================================

PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: usersAlertado';
PRINT '------------------------------------------------------------------------------------------------------------';

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='usersAlertado' AND xtype='U')
BEGIN
    CREATE TABLE usersAlertado (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        usuario NVARCHAR(100) UNIQUE NOT NULL,
        password NVARCHAR(255) NOT NULL,
        rol NVARCHAR(50) NOT NULL CHECK (rol IN ('Administrador', 'Operador', 'Tecnico', 'Observador')),
        sitios_asignados NVARCHAR(MAX) NULL,
        activo BIT NOT NULL DEFAULT 1,
        fecha_creacion DATETIME DEFAULT GETDATE(),
        fecha_modificacion DATETIME DEFAULT GETDATE()
    );

    CREATE INDEX IX_usersAlertado_usuario ON usersAlertado(usuario);
    CREATE INDEX IX_usersAlertado_rol ON usersAlertado(rol);
    CREATE INDEX IX_usersAlertado_activo ON usersAlertado(activo);

    PRINT 'Tabla usersAlertado creada exitosamente con indices';
END
ELSE
BEGIN
    PRINT 'Tabla usersAlertado ya existe';

    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usersAlertado') AND name = 'sitio_asignado')
    BEGIN
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usersAlertado') AND name = 'sitios_asignados')
        BEGIN
            ALTER TABLE usersAlertado ADD sitios_asignados NVARCHAR(MAX) NULL;
        END

        UPDATE usersAlertado
        SET sitios_asignados = CASE
            WHEN sitio_asignado IS NOT NULL AND sitio_asignado != ''
            THEN '["' + sitio_asignado + '"]'
            ELSE NULL
        END
        WHERE sitios_asignados IS NULL;

        ALTER TABLE usersAlertado DROP COLUMN sitio_asignado;
        PRINT 'Datos migrados de sitio_asignado a sitios_asignados';
    END
    ELSE IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usersAlertado') AND name = 'sitios_asignados')
    BEGIN
        ALTER TABLE usersAlertado ADD sitios_asignados NVARCHAR(MAX) NULL;
        PRINT 'Columna sitios_asignados agregada';
    END
END
GO

-- ============================================================================================================
-- INSERTAR USUARIO ADMINISTRADOR POR DEFECTO
-- ============================================================================================================

PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Insertando usuario administrador por defecto';
PRINT '------------------------------------------------------------------------------------------------------------';

IF NOT EXISTS (SELECT * FROM usersAlertado WHERE usuario = 'admin')
BEGIN
    INSERT INTO usersAlertado (usuario, password, rol, sitios_asignados, activo, fecha_creacion, fecha_modificacion)
    VALUES ('admin', 'Admin123!', 'Administrador', NULL, 1, GETDATE(), GETDATE());

    PRINT 'Usuario administrador creado: admin / Admin123!';
END
ELSE
BEGIN
    PRINT 'Usuario administrador ya existe';
END
GO

-- ============================================================================================================
-- TABLA 7: alerts_history
-- Historico permanente de todas las alertas
-- Incluye campos: gwName, gwIp, [group], uuid_open, uuid_closed
-- ============================================================================================================

PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: alerts_history';
PRINT '------------------------------------------------------------------------------------------------------------';

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

        duration_minutes INT,

        uuid_open NVARCHAR(255),
        uuid_closed NVARCHAR(255),

        gwName NVARCHAR(255) NULL,
        gwIp NVARCHAR(50) NULL,
        [group] NVARCHAR(100) NULL
    );

    PRINT 'Tabla alerts_history creada correctamente';
END
ELSE
BEGIN
    PRINT 'Tabla alerts_history ya existe';

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'alerts_history' AND COLUMN_NAME = 'gwName')
    BEGIN
        ALTER TABLE dbo.alerts_history ADD gwName NVARCHAR(255) NULL;
        PRINT 'Campo gwName agregado a alerts_history';
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'alerts_history' AND COLUMN_NAME = 'gwIp')
    BEGIN
        ALTER TABLE dbo.alerts_history ADD gwIp NVARCHAR(50) NULL;
        PRINT 'Campo gwIp agregado a alerts_history';
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'alerts_history' AND COLUMN_NAME = 'group')
    BEGIN
        ALTER TABLE dbo.alerts_history ADD [group] NVARCHAR(100) NULL;
        PRINT 'Campo [group] agregado a alerts_history';
    END
END
GO

-- Indices para alerts_history
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

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_alerts_history_uuid_open')
    CREATE INDEX IX_alerts_history_uuid_open ON alerts_history(uuid_open);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_alerts_history_uuid_closed')
    CREATE INDEX IX_alerts_history_uuid_closed ON alerts_history(uuid_closed);
GO

-- Actualizar registros existentes de alerts_history con el campo [group] basado en site
UPDATE dbo.alerts_history
SET [group] = CASE
    WHEN LOWER(site) LIKE '%cantabria%' THEN 'GTH_IN_ES_DCaaS_DC_H&E_Cantabria'
    WHEN LOWER(site) LIKE '%boadilla%' THEN 'GTH_IN_ES_DCaaS_DC_H&E_Boadilla'
    ELSE ''
END
WHERE [group] IS NULL;
PRINT 'Registros existentes actualizados en alerts_history con campo [group]';
GO

-- ============================================================================================================
-- TABLA 8: maintenance_history
-- Historico permanente de todos los mantenimientos
-- ============================================================================================================

PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Creando tabla: maintenance_history';
PRINT '------------------------------------------------------------------------------------------------------------';

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
ELSE
BEGIN
    PRINT 'Tabla maintenance_history ya existe';
END
GO

-- Indices para maintenance_history
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

-- ============================================================================================================
-- VERIFICACION FINAL
-- ============================================================================================================

PRINT '';
PRINT '============================================================================================================';
PRINT 'VERIFICACION: Contando registros en cada tabla';
PRINT '============================================================================================================';

SELECT 'threshold_configs' as Tabla, COUNT(*) as Total_Registros FROM threshold_configs
UNION ALL SELECT 'rack_threshold_overrides', COUNT(*) FROM rack_threshold_overrides
UNION ALL SELECT 'active_critical_alerts', COUNT(*) FROM active_critical_alerts
UNION ALL SELECT 'maintenance_entries', COUNT(*) FROM maintenance_entries
UNION ALL SELECT 'maintenance_rack_details', COUNT(*) FROM maintenance_rack_details
UNION ALL SELECT 'usersAlertado', COUNT(*) FROM usersAlertado
UNION ALL SELECT 'alerts_history', COUNT(*) FROM alerts_history
UNION ALL SELECT 'maintenance_history', COUNT(*) FROM maintenance_history;

PRINT '';
PRINT '============================================================================================================';
PRINT 'SETUP COMPLETO DE BASE DE DATOS FINALIZADO EXITOSAMENTE';
PRINT '============================================================================================================';
PRINT '';
PRINT 'TABLAS CREADAS:';
PRINT '  - threshold_configs         : Umbrales globales';
PRINT '  - rack_threshold_overrides  : Umbrales por rack';
PRINT '  - active_critical_alerts    : Alertas activas (con uuid_open/uuid_closed, gwName/gwIp, [group])';
PRINT '  - maintenance_entries       : Entradas de mantenimiento';
PRINT '  - maintenance_rack_details  : Detalles de mantenimiento (con gwName/gwIp)';
PRINT '  - usersAlertado             : Sistema de usuarios';
PRINT '  - alerts_history            : Historico de alertas (con gwName/gwIp, [group])';
PRINT '  - maintenance_history       : Historico de mantenimientos';
PRINT '';
PRINT 'USUARIO ADMIN: admin / Admin123!';
PRINT '============================================================================================================';
GO
