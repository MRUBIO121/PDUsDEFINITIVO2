-- ============================================================================================================
-- ARCHIVO: complete_database_setup.sql
-- PROPOSITO: Setup completo consolidado de toda la base de datos del sistema de monitoreo de energía
-- FECHA: 2025-11-17
-- VERSION: 3.0 - Consolidación completa de todos los scripts
-- ============================================================================================================
--
-- Este script consolidado incluye:
--   1. Creación de base de datos
--   2. Todas las tablas del sistema (umbrales, alertas, mantenimiento, usuarios)
--   3. Configuración de umbrales con soporte completo de voltaje
--   4. Sistema de usuarios con roles y permisos
--   5. Datos iniciales (umbrales por defecto, usuario admin)
--
-- TABLAS INCLUIDAS:
--   1. threshold_configs           - Umbrales globales de todas las métricas
--   2. rack_threshold_overrides    - Umbrales específicos por rack
--   3. active_critical_alerts      - Alertas críticas activas en tiempo real
--   4. maintenance_entries         - Entradas de mantenimiento (racks o chains completas)
--   5. maintenance_rack_details    - Detalles de cada rack en mantenimiento
--   6. usersAlertado               - Usuarios del sistema con roles y permisos
--
-- ============================================================================================================

-- ============================================================================================================
-- PASO 1: Crear la base de datos si no existe
-- ============================================================================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'energy_monitor_db')
BEGIN
    CREATE DATABASE energy_monitor_db;
    PRINT '✅ Base de datos energy_monitor_db creada';
END
ELSE
BEGIN
    PRINT 'ℹ️  Base de datos energy_monitor_db ya existe';
END
GO

-- Cambiar al contexto de la base de datos
USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================================================';
PRINT 'INICIO: Configuración completa del sistema de monitoreo de energía';
PRINT '============================================================================================================';
PRINT '';

-- ============================================================================================================
-- TABLA 1: threshold_configs
-- ============================================================================================================
-- PROPOSITO: Almacena los umbrales globales para todas las métricas del sistema
--
-- DESCRIPCION:
--   Esta tabla contiene los umbrales (thresholds) que determinan cuándo una métrica
--   está en estado crítico o de advertencia. Incluye umbrales para:
--   - Temperatura (crítico/advertencia, bajo/alto)
--   - Humedad (crítico/advertencia, bajo/alto)
--   - Amperaje por fase - Monofásico y Trifásico (crítico/advertencia, bajo/alto)
--   - Voltaje (crítico/advertencia, bajo/alto) con soporte para totalVolts
--   - Potencia (crítico/advertencia, solo alto)
--
-- CAMPOS:
--   - id              : Identificador único del umbral (GUID)
--   - threshold_key   : Clave única que identifica el tipo de umbral
--   - value           : Valor numérico del umbral
--   - unit            : Unidad de medida (V, A, C, %, W)
--   - description     : Descripción legible del umbral
--   - created_at      : Fecha de creación del registro
--   - updated_at      : Fecha de última actualización
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Unique constraint en 'threshold_key'
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
    PRINT '✅ Tabla threshold_configs creada exitosamente';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla threshold_configs ya existe';
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
    -- UMBRALES DE TEMPERATURA (°C)
    ('critical_temperature_low', 5.0, 'C', 'Temperatura crítica mínima - Por debajo puede causar condensación'),
    ('critical_temperature_high', 40.0, 'C', 'Temperatura crítica máxima - Puede dañar equipos'),
    ('warning_temperature_low', 10.0, 'C', 'Temperatura advertencia mínima - Fuera del rango óptimo'),
    ('warning_temperature_high', 30.0, 'C', 'Temperatura advertencia máxima - Fuera del rango óptimo'),

    -- UMBRALES DE HUMEDAD (%)
    ('critical_humidity_low', 20.0, '%', 'Humedad crítica mínima - Riesgo de electricidad estática'),
    ('critical_humidity_high', 80.0, '%', 'Humedad crítica máxima - Riesgo de condensación'),
    ('warning_humidity_low', 30.0, '%', 'Humedad advertencia mínima - Fuera del rango óptimo'),
    ('warning_humidity_high', 70.0, '%', 'Humedad advertencia máxima - Fuera del rango óptimo'),

    -- UMBRALES DE AMPERAJE - SISTEMA MONOFÁSICO (A)
    ('critical_amperage_low_single_phase', 1.0, 'A', 'Amperaje crítico mínimo monofásico - Posible desconexión'),
    ('critical_amperage_high_single_phase', 25.0, 'A', 'Amperaje crítico máximo monofásico - Sobrecarga'),
    ('warning_amperage_low_single_phase', 2.0, 'A', 'Amperaje advertencia mínimo monofásico - Consumo bajo'),
    ('warning_amperage_high_single_phase', 20.0, 'A', 'Amperaje advertencia máximo monofásico - Acercándose al límite'),

    -- UMBRALES DE AMPERAJE - SISTEMA TRIFÁSICO (A)
    ('critical_amperage_low_3_phase', 1.0, 'A', 'Amperaje crítico mínimo trifásico - Posible desconexión'),
    ('critical_amperage_high_3_phase', 30.0, 'A', 'Amperaje crítico máximo trifásico - Sobrecarga'),
    ('warning_amperage_low_3_phase', 2.0, 'A', 'Amperaje advertencia mínimo trifásico - Consumo bajo'),
    ('warning_amperage_high_3_phase', 25.0, 'A', 'Amperaje advertencia máximo trifásico - Acercándose al límite'),

    -- UMBRALES DE VOLTAJE (V)
    -- IMPORTANTE: 0V indica ausencia total de energía (genera alerta crítica)
    -- Diferentes a amperaje: 0A es normal (sin carga), 0V es crítico (sin energía)
    ('critical_voltage_low', 0.0, 'V', 'Voltaje crítico mínimo - 0V indica ausencia total de energía (genera alerta crítica)'),
    ('critical_voltage_high', 250.0, 'V', 'Voltaje crítico máximo - Riesgo de daño a equipos electrónicos'),
    ('warning_voltage_low', 0.0, 'V', 'Voltaje advertencia mínimo - 0V indica ausencia total de energía (genera alerta crítica)'),
    ('warning_voltage_high', 240.0, 'V', 'Voltaje advertencia máximo - Fuera del rango nominal'),

    -- UMBRALES DE POTENCIA (W)
    ('critical_power_high', 5000.0, 'W', 'Potencia crítica máxima - Sobrecarga del PDU'),
    ('warning_power_high', 4000.0, 'W', 'Potencia advertencia máxima - Acercándose al límite del PDU')
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

PRINT '✅ Umbrales por defecto insertados/actualizados (incluye umbrales de voltaje con 0V = crítico)';
GO

-- ============================================================================================================
-- TABLA 2: rack_threshold_overrides
-- ============================================================================================================
-- PROPOSITO: Almacena umbrales específicos para racks individuales que sobrescriben los globales
--
-- DESCRIPCION:
--   Esta tabla permite configurar umbrales personalizados para racks específicos.
--
-- CAMPOS:
--   - id              : Identificador único del override (GUID)
--   - rack_id         : ID del rack al que aplica este umbral
--   - threshold_key   : Clave del umbral que se está sobrescribiendo
--   - value           : Valor del umbral específico para este rack
--   - unit            : Unidad de medida
--   - description     : Descripción del porqué de este override
--   - created_at      : Fecha de creación
--   - updated_at      : Fecha de última actualización
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Unique constraint en (rack_id, threshold_key)
--
-- INDICES:
--   - IX_rack_threshold_overrides_rack_id
--   - IX_rack_threshold_overrides_threshold_key
--   - IX_rack_threshold_overrides_created_at
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

    PRINT '✅ Tabla rack_threshold_overrides creada con índices';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla rack_threshold_overrides ya existe';
END
GO

-- ============================================================================================================
-- TABLA 3: active_critical_alerts
-- ============================================================================================================
-- PROPOSITO: Almacena SOLO las alertas críticas que están actualmente activas en el sistema
--
-- DESCRIPCION:
--   Esta es una tabla "en vivo" que contiene únicamente las alertas que están sucediendo AHORA.
--   - Se INSERTA un registro cuando una métrica entra en estado crítico
--   - Se ACTUALIZA cuando la alerta persiste
--   - Se ELIMINA cuando la métrica vuelve a estado normal
--
-- CAMPOS:
--   - id                  : Identificador único de la alerta (GUID)
--   - pdu_id              : ID del PDU que tiene la alerta
--   - rack_id             : ID del rack al que pertenece el PDU
--   - name                : Nombre del rack/PDU
--   - country, site, dc   : Ubicación geográfica
--   - phase               : Tipo de fase eléctrica
--   - chain, node, serial : Identificadores adicionales
--   - alert_type          : Tipo de alerta (siempre 'critical')
--   - metric_type         : Tipo de métrica: 'amperage' | 'temperature' | 'humidity' | 'voltage'
--   - alert_reason        : Razón específica (ej: 'critical_voltage_high')
--   - alert_value         : Valor actual de la métrica
--   - alert_field         : Campo específico: 'current' | 'voltage' | 'temperature' | 'sensorHumidity'
--   - threshold_exceeded  : Valor del umbral que fue excedido
--   - alert_started_at    : Cuándo comenzó la alerta
--   - last_updated_at     : Última vez que se confirmó que la alerta persiste
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Unique constraint en (pdu_id, metric_type, alert_reason)
--
-- INDICES:
--   - IX_active_critical_alerts_pdu_id
--   - IX_active_critical_alerts_metric_type
--   - IX_active_critical_alerts_site
--   - IX_active_critical_alerts_dc
--   - IX_active_critical_alerts_alert_started_at
--   - IX_active_critical_alerts_last_updated
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
        CONSTRAINT UK_active_critical_alerts_pdu_metric UNIQUE (pdu_id, metric_type, alert_reason)
    );

    CREATE INDEX IX_active_critical_alerts_pdu_id ON active_critical_alerts(pdu_id);
    CREATE INDEX IX_active_critical_alerts_alert_started_at ON active_critical_alerts(alert_started_at);
    CREATE INDEX IX_active_critical_alerts_metric_type ON active_critical_alerts(metric_type);
    CREATE INDEX IX_active_critical_alerts_alert_type ON active_critical_alerts(alert_type);
    CREATE INDEX IX_active_critical_alerts_site ON active_critical_alerts(site);
    CREATE INDEX IX_active_critical_alerts_dc ON active_critical_alerts(dc);
    CREATE INDEX IX_active_critical_alerts_last_updated ON active_critical_alerts(last_updated_at);

    PRINT '✅ Tabla active_critical_alerts creada con índices';
    PRINT '   - Soporta alertas para métrica de voltaje (metric_type = ''voltage'')';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla active_critical_alerts ya existe';
END
GO

-- ============================================================================================================
-- TABLA 4: maintenance_entries
-- ============================================================================================================
-- PROPOSITO: Almacena las entradas principales de mantenimiento
--
-- DESCRIPCION:
--   Esta tabla representa cada "sesión de mantenimiento" que puede ser:
--   - Un rack individual puesto en mantenimiento
--   - Una chain completa (múltiples racks) puesta en mantenimiento
--
-- CAMPOS:
--   - id          : Identificador único de la entrada de mantenimiento (GUID)
--   - entry_type  : Tipo de entrada: 'individual_rack' o 'chain'
--   - rack_id     : ID del rack (solo para entry_type = 'individual_rack')
--   - chain       : Número de chain (requerido para entry_type = 'chain')
--   - site        : Sitio donde está ubicado
--   - dc          : Data center (requerido)
--   - reason      : Motivo del mantenimiento (texto libre)
--   - started_at  : Fecha y hora de inicio del mantenimiento
--   - started_by  : Usuario que inició el mantenimiento
--   - created_at  : Timestamp de creación del registro
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Check constraint: entry_type debe ser 'individual_rack' o 'chain'
--
-- INDICES:
--   - IX_maintenance_entries_type
--   - IX_maintenance_entries_rack_id
--   - IX_maintenance_entries_chain_dc
--   - IX_maintenance_entries_dc
--   - IX_maintenance_entries_started_at
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
        created_at DATETIME DEFAULT GETDATE()
    );

    CREATE INDEX IX_maintenance_entries_type ON maintenance_entries(entry_type);
    CREATE INDEX IX_maintenance_entries_rack_id ON maintenance_entries(rack_id);
    CREATE INDEX IX_maintenance_entries_chain_dc ON maintenance_entries(chain, dc);
    CREATE INDEX IX_maintenance_entries_dc ON maintenance_entries(dc);
    CREATE INDEX IX_maintenance_entries_started_at ON maintenance_entries(started_at);

    PRINT '✅ Tabla maintenance_entries creada con índices';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla maintenance_entries ya existe';
END
GO

-- ============================================================================================================
-- TABLA 5: maintenance_rack_details
-- ============================================================================================================
-- PROPOSITO: Almacena los detalles de cada rack individual que está en mantenimiento
--
-- DESCRIPCION:
--   Esta tabla contiene un registro por cada rack que está en mantenimiento,
--   vinculado a una entrada en maintenance_entries.
--
-- CAMPOS:
--   - id                      : Identificador único del detalle (GUID)
--   - maintenance_entry_id    : Foreign key a maintenance_entries
--   - rack_id                 : ID del rack en mantenimiento
--   - pdu_id                  : ID del PDU asociado
--   - name                    : Nombre del rack/PDU
--   - country, site, dc       : Ubicación geográfica
--   - phase                   : Tipo de fase eléctrica
--   - chain, node, serial     : Identificadores adicionales
--   - created_at              : Timestamp de creación
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Foreign Key a maintenance_entries con ON DELETE CASCADE
--   - Unique constraint en (maintenance_entry_id, rack_id)
--
-- INDICES:
--   - IX_maintenance_rack_details_entry_id
--   - IX_maintenance_rack_details_rack_id
--   - IX_maintenance_rack_details_chain_dc
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

    PRINT '✅ Tabla maintenance_rack_details creada con índices y constraints';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla maintenance_rack_details ya existe';
END
GO

-- ============================================================================================================
-- TABLA 6: usersAlertado
-- ============================================================================================================
-- PROPOSITO: Almacena los usuarios del sistema con sus credenciales y roles
--
-- DESCRIPCION:
--   Esta tabla contiene toda la información de los usuarios que pueden acceder al sistema.
--   IMPORTANTE: Las contraseñas se almacenan en TEXTO PLANO (sin cifrado).
--
-- ROLES DISPONIBLES:
--   - Administrador: Control total incluyendo gestión de usuarios
--   - Operador: Control total excepto gestión de usuarios
--   - Tecnico: Ver alertas y gestionar mantenimiento solamente
--   - Observador: Solo lectura sin permisos de modificación
--
-- CAMPOS:
--   - id                : Identificador único del usuario (GUID)
--   - usuario           : Nombre de usuario único para login
--   - password          : Contraseña en texto plano
--   - rol               : Rol del usuario
--   - sitios_asignados  : JSON array con los sitios asignados (ej: '["BCN","MAD"]')
--   - activo            : Indica si el usuario está activo (soft delete)
--   - fecha_creacion    : Fecha de creación del usuario
--   - fecha_modificacion: Fecha de última modificación
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Unique constraint en 'usuario'
--   - Check constraint en 'rol'
--
-- INDICES:
--   - IX_usersAlertado_usuario
--   - IX_usersAlertado_rol
--   - IX_usersAlertado_activo
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

    PRINT '✅ Tabla usersAlertado creada exitosamente con índices';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla usersAlertado ya existe';

    -- Verificar si existe la columna antigua sitio_asignado y migrar
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usersAlertado') AND name = 'sitio_asignado')
    BEGIN
        PRINT 'ℹ️  Columna antigua sitio_asignado encontrada, migrando a sitios_asignados...';

        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usersAlertado') AND name = 'sitios_asignados')
        BEGIN
            ALTER TABLE usersAlertado ADD sitios_asignados NVARCHAR(MAX) NULL;
            PRINT '✅ Columna sitios_asignados creada';
        END

        UPDATE usersAlertado
        SET sitios_asignados = CASE
            WHEN sitio_asignado IS NOT NULL AND sitio_asignado != ''
            THEN '["' + sitio_asignado + '"]'
            ELSE NULL
        END
        WHERE sitios_asignados IS NULL;

        PRINT '✅ Datos migrados de sitio_asignado a sitios_asignados';

        ALTER TABLE usersAlertado DROP COLUMN sitio_asignado;
        PRINT '✅ Columna antigua sitio_asignado eliminada';
    END
    ELSE IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usersAlertado') AND name = 'sitios_asignados')
    BEGIN
        ALTER TABLE usersAlertado ADD sitios_asignados NVARCHAR(MAX) NULL;
        PRINT '✅ Columna sitios_asignados añadida a tabla existente';
    END
END
GO

-- ============================================================================================================
-- INSERTAR USUARIO ADMINISTRADOR POR DEFECTO
-- ============================================================================================================
-- CREDENCIALES POR DEFECTO:
--   Usuario: admin
--   Contraseña: Admin123!
-- ============================================================================================================

PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Insertando usuario administrador por defecto';
PRINT '------------------------------------------------------------------------------------------------------------';

IF NOT EXISTS (SELECT * FROM usersAlertado WHERE usuario = 'admin')
BEGIN
    INSERT INTO usersAlertado (usuario, password, rol, sitios_asignados, activo, fecha_creacion, fecha_modificacion)
    VALUES (
        'admin',
        'Admin123!',
        'Administrador',
        NULL,
        1,
        GETDATE(),
        GETDATE()
    );

    PRINT '✅ Usuario administrador creado exitosamente';
    PRINT '   Usuario: admin';
    PRINT '   Contraseña: Admin123!';
END
ELSE
BEGIN
    PRINT 'ℹ️  Usuario administrador ya existe';
END
GO

-- ============================================================================================================
-- PASO FINAL: Verificación y resumen
-- ============================================================================================================

PRINT '';
PRINT '============================================================================================================';
PRINT 'VERIFICACIÓN: Contando registros en cada tabla';
PRINT '============================================================================================================';

SELECT
    'threshold_configs' as Tabla,
    COUNT(*) as Total_Registros,
    'Umbrales globales (incluye voltaje con 0V = crítico)' as Descripcion
FROM threshold_configs
UNION ALL
SELECT
    'rack_threshold_overrides' as Tabla,
    COUNT(*) as Total_Registros,
    'Umbrales específicos por rack' as Descripcion
FROM rack_threshold_overrides
UNION ALL
SELECT
    'active_critical_alerts' as Tabla,
    COUNT(*) as Total_Registros,
    'Alertas críticas activas (incluye alertas de voltaje)' as Descripcion
FROM active_critical_alerts
UNION ALL
SELECT
    'maintenance_entries' as Tabla,
    COUNT(*) as Total_Registros,
    'Entradas de mantenimiento' as Descripcion
FROM maintenance_entries
UNION ALL
SELECT
    'maintenance_rack_details' as Tabla,
    COUNT(*) as Total_Registros,
    'Detalles de racks en mantenimiento' as Descripcion
FROM maintenance_rack_details
UNION ALL
SELECT
    'usersAlertado' as Tabla,
    COUNT(*) as Total_Registros,
    'Usuarios del sistema con roles y permisos' as Descripcion
FROM usersAlertado;

PRINT '';
PRINT '============================================================================================================';
PRINT '✅ Setup completo de base de datos FINALIZADO EXITOSAMENTE';
PRINT '============================================================================================================';
PRINT '';
PRINT 'RESUMEN DE CONFIGURACIÓN:';
PRINT '';
PRINT '📊 TABLAS CREADAS:';
PRINT '  ✅ threshold_configs         - Umbrales globales';
PRINT '  ✅ rack_threshold_overrides  - Umbrales por rack';
PRINT '  ✅ active_critical_alerts    - Alertas activas';
PRINT '  ✅ maintenance_entries       - Entradas de mantenimiento';
PRINT '  ✅ maintenance_rack_details  - Detalles de mantenimiento';
PRINT '  ✅ usersAlertado             - Sistema de usuarios';
PRINT '';
PRINT '🔌 SOPORTE PARA VOLTAJE:';
PRINT '  ✅ Umbrales configurados con 0V = crítico (sin energía)';
PRINT '  ✅ critical_voltage_low: 0.0 V (sin energía = alerta)';
PRINT '  ✅ warning_voltage_low: 0.0 V (sin energía = alerta)';
PRINT '  ✅ warning_voltage_high: 240.0 V (sobrevoltaje leve)';
PRINT '  ✅ critical_voltage_high: 250.0 V (sobrevoltaje peligroso)';
PRINT '';
PRINT '👥 SISTEMA DE USUARIOS:';
PRINT '  ✅ 4 roles: Administrador, Operador, Técnico, Observador';
PRINT '  ✅ Usuario admin creado con contraseña: Admin123!';
PRINT '  ✅ Soporte para múltiples sitios asignados por usuario';
PRINT '';
PRINT 'PRÓXIMOS PASOS:';
PRINT '  1. Acceder al sistema con admin / Admin123!';
PRINT '  2. Ajustar umbrales según necesidades específicas';
PRINT '  3. Crear usuarios adicionales según sea necesario';
PRINT '  4. Configurar umbrales específicos por rack si es necesario';
PRINT '';
PRINT '============================================================================================================';
GO
