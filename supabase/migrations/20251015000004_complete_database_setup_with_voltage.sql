-- ============================================================================================================
-- ARCHIVO: complete_database_setup_with_voltage.sql
-- PROPOSITO: Setup completo de todas las tablas del sistema de monitoreo de energía con soporte para voltaje
-- FECHA: 2025-10-09
-- VERSION: 2.0 - Incluye soporte completo para métrica de voltaje (totalVolts)
-- ============================================================================================================
--
-- Este script configura todas las tablas necesarias para el sistema de monitoreo de energía,
-- incluyendo soporte completo para la métrica de voltaje proveniente del campo "totalVolts"
-- del endpoint /power de la API NENG.
--
-- TABLAS INCLUIDAS:
--   1. threshold_configs           - Umbrales globales de todas las métricas
--   2. rack_threshold_overrides    - Umbrales específicos por rack
--   3. active_critical_alerts      - Alertas críticas activas en tiempo real
--   4. maintenance_entries         - Entradas de mantenimiento (racks o chains completas)
--   5. maintenance_rack_details    - Detalles de cada rack en mantenimiento
--
-- ============================================================================================================

-- ============================================================================================================
-- PASO 1: Crear la base de datos si no existe
-- ============================================================================================================
-- Crea la base de datos principal del sistema de monitoreo de energía
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
PRINT 'INICIO: Configuración de tablas del sistema de monitoreo de energía';
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
--   - Voltaje (crítico/advertencia, bajo/alto) ← NUEVO SOPORTE PARA totalVolts
--   - Potencia (crítico/advertencia, solo alto)
--
-- CAMPOS:
--   - id              : Identificador único del umbral (GUID)
--   - threshold_key   : Clave única que identifica el tipo de umbral (ej: 'critical_voltage_low')
--   - value           : Valor numérico del umbral
--   - unit            : Unidad de medida (V, A, C, %, W)
--   - description     : Descripción legible del umbral
--   - created_at      : Fecha de creación del registro
--   - updated_at      : Fecha de última actualización
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Unique constraint en 'threshold_key' para evitar duplicados
--
-- USO:
--   Estos umbrales son consultados por el backend para evaluar si una métrica
--   está fuera de rango y generar alertas automáticamente.
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
-- PROPOSITO: Poblar la tabla con umbrales iniciales para todas las métricas
--
-- NOTA IMPORTANTE SOBRE VOLTAJE:
--   Los umbrales de voltaje se establecen con valores típicos para sistemas de 220V:
--   - Critical Low:  200V (por debajo de este valor es crítico)
--   - Warning Low:   210V (advertencia cuando está entre 200-210V)
--   - Warning High:  240V (advertencia cuando está entre 240-250V)
--   - Critical High: 250V (por encima de este valor es crítico)
--
--   Estos valores son estándares para sistemas eléctricos de 220V ±10%
--   IMPORTANTE: Ajustar según las especificaciones de su infraestructura eléctrica
-- ============================================================================================================

PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Insertando/actualizando umbrales por defecto';
PRINT '------------------------------------------------------------------------------------------------------------';

MERGE threshold_configs AS target
USING (VALUES
    -- ========================================================================================================
    -- UMBRALES DE TEMPERATURA (°C)
    -- ========================================================================================================
    -- Rangos típicos para salas de servidores: 18-27°C
    ('critical_temperature_low', 5.0, 'C', 'Temperatura crítica mínima - Por debajo puede causar condensación'),
    ('critical_temperature_high', 40.0, 'C', 'Temperatura crítica máxima - Puede dañar equipos'),
    ('warning_temperature_low', 10.0, 'C', 'Temperatura advertencia mínima - Fuera del rango óptimo'),
    ('warning_temperature_high', 30.0, 'C', 'Temperatura advertencia máxima - Fuera del rango óptimo'),

    -- ========================================================================================================
    -- UMBRALES DE HUMEDAD (%)
    -- ========================================================================================================
    -- Rangos típicos para salas de servidores: 40-60%
    ('critical_humidity_low', 20.0, '%', 'Humedad crítica mínima - Riesgo de electricidad estática'),
    ('critical_humidity_high', 80.0, '%', 'Humedad crítica máxima - Riesgo de condensación'),
    ('warning_humidity_low', 30.0, '%', 'Humedad advertencia mínima - Fuera del rango óptimo'),
    ('warning_humidity_high', 70.0, '%', 'Humedad advertencia máxima - Fuera del rango óptimo'),

    -- ========================================================================================================
    -- UMBRALES DE AMPERAJE - SISTEMA MONOFÁSICO (A)
    -- ========================================================================================================
    -- Para sistemas monofásicos típicos (220V, 16-32A)
    ('critical_amperage_low_single_phase', 1.0, 'A', 'Amperaje crítico mínimo monofásico - Posible desconexión'),
    ('critical_amperage_high_single_phase', 25.0, 'A', 'Amperaje crítico máximo monofásico - Sobrecarga'),
    ('warning_amperage_low_single_phase', 2.0, 'A', 'Amperaje advertencia mínimo monofásico - Consumo bajo'),
    ('warning_amperage_high_single_phase', 20.0, 'A', 'Amperaje advertencia máximo monofásico - Acercándose al límite'),

    -- ========================================================================================================
    -- UMBRALES DE AMPERAJE - SISTEMA TRIFÁSICO (A)
    -- ========================================================================================================
    -- Para sistemas trifásicos típicos (380V, 32-63A por fase)
    ('critical_amperage_low_3_phase', 1.0, 'A', 'Amperaje crítico mínimo trifásico - Posible desconexión'),
    ('critical_amperage_high_3_phase', 30.0, 'A', 'Amperaje crítico máximo trifásico - Sobrecarga'),
    ('warning_amperage_low_3_phase', 2.0, 'A', 'Amperaje advertencia mínimo trifásico - Consumo bajo'),
    ('warning_amperage_high_3_phase', 25.0, 'A', 'Amperaje advertencia máximo trifásico - Acercándose al límite'),

    -- ========================================================================================================
    -- UMBRALES DE VOLTAJE (V) ← NUEVOS UMBRALES PARA totalVolts
    -- ========================================================================================================
    -- Para sistemas de 220V ±10% (rango nominal: 198V - 242V)
    -- Estos umbrales son críticos para detectar problemas eléctricos
    --
    -- CRITICAL LOW (200V):  Voltaje demasiado bajo puede causar mal funcionamiento de equipos
    -- WARNING LOW (210V):   Voltaje bajo - fuera del rango nominal pero aceptable temporalmente
    -- WARNING HIGH (240V):  Voltaje alto - fuera del rango nominal pero aceptable temporalmente
    -- CRITICAL HIGH (250V): Voltaje demasiado alto puede dañar equipos electrónicos
    --
    -- IMPORTANTE: Ajustar según las especificaciones de su instalación eléctrica
    -- Para sistemas de 110V, usar valores aproximadamente la mitad (95V, 105V, 120V, 125V)
    -- Para sistemas de 380V, usar valores proporcionales (350V, 370V, 410V, 420V)
    ('critical_voltage_low', 200.0, 'V', 'Voltaje crítico mínimo - Riesgo de mal funcionamiento de equipos'),
    ('critical_voltage_high', 250.0, 'V', 'Voltaje crítico máximo - Riesgo de daño a equipos electrónicos'),
    ('warning_voltage_low', 210.0, 'V', 'Voltaje advertencia mínimo - Fuera del rango nominal'),
    ('warning_voltage_high', 240.0, 'V', 'Voltaje advertencia máximo - Fuera del rango nominal'),

    -- ========================================================================================================
    -- UMBRALES DE POTENCIA (W)
    -- ========================================================================================================
    -- Para PDUs típicos de 5kW
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

PRINT '✅ Umbrales por defecto insertados/actualizados (incluye umbrales de voltaje)';
GO

-- ============================================================================================================
-- TABLA 2: rack_threshold_overrides
-- ============================================================================================================
-- PROPOSITO: Almacena umbrales específicos para racks individuales que sobrescriben los globales
--
-- DESCRIPCION:
--   Esta tabla permite configurar umbrales personalizados para racks específicos que necesitan
--   límites diferentes a los globales. Por ejemplo:
--   - Un rack con equipos más sensibles puede tener umbrales de temperatura más estrictos
--   - Un rack de alta capacidad puede tener umbrales de amperaje más altos
--   - Un rack con voltaje estabilizado puede tener umbrales de voltaje más estrechos
--
-- CAMPOS:
--   - id              : Identificador único del override (GUID)
--   - rack_id         : ID del rack al que aplica este umbral (debe coincidir con RackData.rackId)
--   - threshold_key   : Clave del umbral que se está sobrescribiendo
--   - value           : Valor del umbral específico para este rack
--   - unit            : Unidad de medida
--   - description     : Descripción del porqué de este override
--   - created_at      : Fecha de creación
--   - updated_at      : Fecha de última actualización
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Unique constraint en (rack_id, threshold_key) para evitar duplicados
--
-- INDICES:
--   - IX_rack_threshold_overrides_rack_id: Para búsquedas rápidas por rack
--   - IX_rack_threshold_overrides_threshold_key: Para búsquedas por tipo de umbral
--   - IX_rack_threshold_overrides_created_at: Para queries ordenadas por fecha
--
-- USO:
--   Cuando el backend evalúa métricas, primero busca overrides específicos del rack
--   en esta tabla. Si existen, usan estos valores en lugar de los globales.
--   Esto aplica a TODAS las métricas incluyendo voltaje (totalVolts).
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

        -- Constraint único: cada rack solo puede tener un override por tipo de umbral
        CONSTRAINT UK_rack_threshold_overrides_rack_key UNIQUE (rack_id, threshold_key)
    );

    -- Crear índices para optimizar búsquedas
    CREATE INDEX IX_rack_threshold_overrides_rack_id ON rack_threshold_overrides(rack_id);
    CREATE INDEX IX_rack_threshold_overrides_threshold_key ON rack_threshold_overrides(threshold_key);
    CREATE INDEX IX_rack_threshold_overrides_created_at ON rack_threshold_overrides(created_at);

    PRINT '✅ Tabla rack_threshold_overrides creada con índices';
    PRINT '   - Soporta overrides para TODAS las métricas incluyendo voltaje';
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
--   - Se ACTUALIZA cuando la alerta persiste (actualiza last_updated_at)
--   - Se ELIMINA cuando la métrica vuelve a estado normal
--
--   Incluye soporte para alertas de VOLTAJE (totalVolts) además de:
--   - Amperaje (current)
--   - Temperatura (temperature / sensorTemperature)
--   - Humedad (sensorHumidity)
--
-- CAMPOS:
--   - id                  : Identificador único de la alerta (GUID)
--   - pdu_id              : ID del PDU que tiene la alerta
--   - rack_id             : ID del rack al que pertenece el PDU
--   - name                : Nombre del rack/PDU
--   - country, site, dc   : Ubicación geográfica
--   - phase               : Tipo de fase eléctrica (single_phase / 3_phase)
--   - chain, node, serial : Identificadores adicionales
--   - alert_type          : Tipo de alerta (siempre 'critical' en esta tabla)
--   - metric_type         : Tipo de métrica: 'amperage' | 'temperature' | 'humidity' | 'voltage'
--   - alert_reason        : Razón específica (ej: 'critical_voltage_high', 'critical_voltage_low')
--   - alert_value         : Valor actual de la métrica que causó la alerta
--   - alert_field         : Campo específico: 'current' | 'voltage' | 'temperature' | 'sensorHumidity'
--   - threshold_exceeded  : Valor del umbral que fue excedido
--   - alert_started_at    : Cuándo comenzó la alerta (no cambia)
--   - last_updated_at     : Última vez que se confirmó que la alerta persiste
--
-- CONSTRAINTS:
--   - Primary Key en 'id'
--   - Unique constraint en (pdu_id, metric_type, alert_reason) para evitar duplicados
--
-- INDICES:
--   - IX_active_critical_alerts_pdu_id: Búsquedas por PDU
--   - IX_active_critical_alerts_metric_type: Filtrar por tipo de métrica (incluye 'voltage')
--   - IX_active_critical_alerts_site/dc: Filtrar por ubicación
--   - IX_active_critical_alerts_alert_started_at: Ordenar por antigüedad
--   - IX_active_critical_alerts_last_updated: Detectar alertas obsoletas
--
-- USO:
--   El backend consulta esta tabla para:
--   1. Mostrar el dashboard de alertas activas en tiempo real
--   2. Exportar reportes de alertas actuales
--   3. Enviar notificaciones de alertas persistentes
--   4. Filtrar por tipo de métrica (amperage, temperature, humidity, voltage)
--
-- LIFECYCLE:
--   INSERT: Cuando un PDU entra en estado crítico para una métrica específica
--   UPDATE: Cada vez que se confirma que la alerta persiste (actualiza last_updated_at)
--   DELETE: Cuando el PDU vuelve a estado normal para esa métrica
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
        metric_type NVARCHAR(50) NOT NULL,  -- Ahora incluye: 'voltage' además de 'amperage', 'temperature', 'humidity'
        alert_reason NVARCHAR(255) NOT NULL,
        alert_value DECIMAL(18, 4),
        alert_field NVARCHAR(100),  -- Ahora incluye: 'voltage' además de 'current', 'temperature', 'sensorHumidity'
        threshold_exceeded DECIMAL(18, 4),
        alert_started_at DATETIME DEFAULT GETDATE(),
        last_updated_at DATETIME DEFAULT GETDATE(),

        -- Constraint único: un PDU solo puede tener una alerta activa por cada combinación de métrica y razón
        CONSTRAINT UK_active_critical_alerts_pdu_metric UNIQUE (pdu_id, metric_type, alert_reason)
    );

    -- Crear índices para optimizar consultas de alertas
    CREATE INDEX IX_active_critical_alerts_pdu_id ON active_critical_alerts(pdu_id);
    CREATE INDEX IX_active_critical_alerts_alert_started_at ON active_critical_alerts(alert_started_at);
    CREATE INDEX IX_active_critical_alerts_metric_type ON active_critical_alerts(metric_type);
    CREATE INDEX IX_active_critical_alerts_alert_type ON active_critical_alerts(alert_type);
    CREATE INDEX IX_active_critical_alerts_site ON active_critical_alerts(site);
    CREATE INDEX IX_active_critical_alerts_dc ON active_critical_alerts(dc);
    CREATE INDEX IX_active_critical_alerts_last_updated ON active_critical_alerts(last_updated_at);

    PRINT '✅ Tabla active_critical_alerts creada con índices';
    PRINT '   - Soporta alertas para métrica de voltaje (metric_type = ''voltage'')';
    PRINT '   - Soporta razones: critical_voltage_low, critical_voltage_high';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla active_critical_alerts ya existe';
END
GO

-- ============================================================================================================
-- TABLA 4: maintenance_entries
-- ============================================================================================================
-- PROPOSITO: Almacena las entradas principales de mantenimiento (agrupaciones de racks en mantenimiento)
--
-- DESCRIPCION:
--   Esta tabla representa cada "sesión de mantenimiento" que puede ser:
--   - Un rack individual puesto en mantenimiento
--   - Una chain completa (múltiples racks) puesta en mantenimiento
--
--   Cuando un rack/chain está en mantenimiento, el sistema:
--   - NO genera alertas para ese rack/chain
--   - Muestra indicador visual de "En Mantenimiento"
--   - Excluye el rack/chain de las vistas de alertas
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
--   - IX_maintenance_entries_type: Filtrar por tipo de entrada
--   - IX_maintenance_entries_rack_id: Buscar por rack específico
--   - IX_maintenance_entries_chain_dc: Buscar chains en mantenimiento por DC
--   - IX_maintenance_entries_dc: Buscar todos los mantenimientos en un DC
--   - IX_maintenance_entries_started_at: Ordenar por fecha de inicio
--
-- RELACION CON OTRAS TABLAS:
--   - maintenance_rack_details: Contiene los detalles de cada rack incluido en esta entrada
--   - ON DELETE CASCADE: Al eliminar una entrada, se eliminan automáticamente sus detalles
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
        rack_id NVARCHAR(255) NULL,  -- Solo para tipo 'individual_rack'
        chain NVARCHAR(255) NULL,
        site NVARCHAR(255) NULL,
        dc NVARCHAR(255) NOT NULL,
        reason NVARCHAR(MAX),
        started_at DATETIME DEFAULT GETDATE(),
        started_by NVARCHAR(255),
        created_at DATETIME DEFAULT GETDATE()
    );

    -- Crear índices para búsquedas eficientes
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
--   vinculado a una entrada en maintenance_entries. Almacena información completa
--   del rack para facilitar reportes y auditorías.
--
--   Cuando se pone una chain completa en mantenimiento, se crean múltiples registros
--   en esta tabla (uno por cada rack de la chain).
--
-- CAMPOS:
--   - id                      : Identificador único del detalle (GUID)
--   - maintenance_entry_id    : Foreign key a maintenance_entries (parent)
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
--   - Unique constraint en (maintenance_entry_id, rack_id) para evitar duplicados
--
-- INDICES:
--   - IX_maintenance_rack_details_entry_id: Buscar detalles de una entrada específica
--   - IX_maintenance_rack_details_rack_id: Verificar si un rack está en mantenimiento
--   - IX_maintenance_rack_details_chain_dc: Buscar racks de una chain en un DC
--
-- USO:
--   El backend consulta esta tabla para:
--   1. Determinar qué racks están en mantenimiento (para excluirlos de alertas)
--   2. Mostrar la lista de racks en mantenimiento en la UI
--   3. Generar reportes de mantenimientos históricos
--
-- IMPORTANTE PARA VOLTAJE:
--   Cuando un rack está en mantenimiento, el sistema NO evalúa NINGUNA métrica
--   incluyendo voltaje (totalVolts). Esto significa:
--   - No se generan alertas de voltaje bajo/alto
--   - No se actualiza active_critical_alerts
--   - El rack muestra estado "normal" con indicador de mantenimiento
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

        -- Foreign key a maintenance_entries con cascade delete
        CONSTRAINT FK_maintenance_rack_details_entry
            FOREIGN KEY (maintenance_entry_id)
            REFERENCES maintenance_entries(id)
            ON DELETE CASCADE,

        -- Constraint único: cada rack solo puede aparecer una vez por entrada de mantenimiento
        CONSTRAINT UK_maintenance_rack_details_entry_rack
            UNIQUE (maintenance_entry_id, rack_id)
    );

    -- Crear índices para búsquedas eficientes
    CREATE INDEX IX_maintenance_rack_details_entry_id ON maintenance_rack_details(maintenance_entry_id);
    CREATE INDEX IX_maintenance_rack_details_rack_id ON maintenance_rack_details(rack_id);
    CREATE INDEX IX_maintenance_rack_details_chain_dc ON maintenance_rack_details(chain, dc);

    PRINT '✅ Tabla maintenance_rack_details creada con índices y constraints';
    PRINT '   - Racks en mantenimiento NO generan alertas de ninguna métrica (incluido voltaje)';
END
ELSE
BEGIN
    PRINT 'ℹ️  Tabla maintenance_rack_details ya existe';
END
GO

-- ============================================================================================================
-- PASO FINAL: Verificación y resumen
-- ============================================================================================================

PRINT '';
PRINT '============================================================================================================';
PRINT 'VERIFICACIÓN: Contando registros en cada tabla';
PRINT '============================================================================================================';

-- Mostrar resumen de todas las tablas
SELECT
    'threshold_configs' as Tabla,
    COUNT(*) as Total_Registros,
    'Umbrales globales (incluye 4 umbrales de voltaje)' as Descripcion
FROM threshold_configs
UNION ALL
SELECT
    'rack_threshold_overrides' as Tabla,
    COUNT(*) as Total_Registros,
    'Umbrales específicos por rack (soporta voltaje)' as Descripcion
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
FROM maintenance_rack_details;

PRINT '';
PRINT '============================================================================================================';
PRINT '✅ Setup completo de base de datos FINALIZADO EXITOSAMENTE';
PRINT '============================================================================================================';
PRINT '';
PRINT 'RESUMEN DE SOPORTE PARA VOLTAJE (totalVolts):';
PRINT '  ✅ threshold_configs: 4 umbrales de voltaje insertados';
PRINT '     - critical_voltage_low: 200.0 V';
PRINT '     - critical_voltage_high: 250.0 V';
PRINT '     - warning_voltage_low: 210.0 V';
PRINT '     - warning_voltage_high: 240.0 V';
PRINT '';
PRINT '  ✅ rack_threshold_overrides: Soporta umbrales de voltaje específicos por rack';
PRINT '  ✅ active_critical_alerts: Soporta metric_type = ''voltage'' y alert_field = ''voltage''';
PRINT '  ✅ Sistema de mantenimiento: Excluye evaluación de voltaje para racks en mantenimiento';
PRINT '';
PRINT 'PRÓXIMOS PASOS:';
PRINT '  1. Verificar que el backend lee el campo totalVolts del API NENG';
PRINT '  2. Ajustar los umbrales de voltaje según la infraestructura eléctrica';
PRINT '  3. Probar generación de alertas de voltaje con datos reales';
PRINT '  4. Configurar umbrales específicos por rack si es necesario';
PRINT '';
PRINT '============================================================================================================';
GO
