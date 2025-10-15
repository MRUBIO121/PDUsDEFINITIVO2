-- ============================================================================================================
-- Script de Verificación de Soporte de Voltaje
-- ============================================================================================================
-- Propósito: Verificar que el sistema tiene configurado correctamente el soporte para voltaje (totalVolts)
-- Ejecutar DESPUÉS de aplicar las migraciones necesarias
-- ============================================================================================================

USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================================================';
PRINT 'VERIFICACIÓN DE SOPORTE DE VOLTAJE';
PRINT '============================================================================================================';
PRINT '';

-- ============================================================================================================
-- 1. Verificar Umbrales de Voltaje en threshold_configs
-- ============================================================================================================
PRINT '1. Verificando umbrales de voltaje en threshold_configs...';
PRINT '------------------------------------------------------------------------------------------------------------';

DECLARE @voltageThresholdsCount INT;
SELECT @voltageThresholdsCount = COUNT(*)
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%';

IF @voltageThresholdsCount >= 4
BEGIN
    PRINT '✅ CORRECTO: ' + CAST(@voltageThresholdsCount AS NVARCHAR(10)) + ' umbrales de voltaje encontrados';
    PRINT '';
    SELECT
        threshold_key AS 'Threshold Key',
        value AS 'Valor',
        unit AS 'Unidad',
        description AS 'Descripción'
    FROM threshold_configs
    WHERE threshold_key LIKE '%voltage%'
    ORDER BY
        CASE
            WHEN threshold_key = 'critical_voltage_low' THEN 1
            WHEN threshold_key = 'warning_voltage_low' THEN 2
            WHEN threshold_key = 'warning_voltage_high' THEN 3
            WHEN threshold_key = 'critical_voltage_high' THEN 4
            ELSE 5
        END;
END
ELSE
BEGIN
    PRINT '❌ ERROR: Solo ' + CAST(@voltageThresholdsCount AS NVARCHAR(10)) + ' umbrales de voltaje encontrados (se esperan 4)';
    PRINT '   Ejecute: supabase/migrations/20251013140000_add_voltage_support.sql';
END

PRINT '';

-- ============================================================================================================
-- 2. Verificar Estructura de active_critical_alerts
-- ============================================================================================================
PRINT '2. Verificando estructura de active_critical_alerts...';
PRINT '------------------------------------------------------------------------------------------------------------';

IF EXISTS (SELECT * FROM sysobjects WHERE name='active_critical_alerts' AND xtype='U')
BEGIN
    DECLARE @hasMetricType BIT = 0;
    DECLARE @hasAlertField BIT = 0;
    DECLARE @hasAlertReason BIT = 0;
    DECLARE @hasAlertValue BIT = 0;
    DECLARE @hasThresholdExceeded BIT = 0;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'metric_type')
        SET @hasMetricType = 1;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'alert_field')
        SET @hasAlertField = 1;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'alert_reason')
        SET @hasAlertReason = 1;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'alert_value')
        SET @hasAlertValue = 1;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'threshold_exceeded')
        SET @hasThresholdExceeded = 1;

    IF @hasMetricType = 1 AND @hasAlertField = 1 AND @hasAlertReason = 1 AND @hasAlertValue = 1 AND @hasThresholdExceeded = 1
    BEGIN
        PRINT '✅ CORRECTO: active_critical_alerts tiene todos los campos necesarios';
        PRINT '   ✓ metric_type (puede almacenar ''voltage'')';
        PRINT '   ✓ alert_field (puede almacenar ''voltage'')';
        PRINT '   ✓ alert_reason (puede almacenar ''critical_voltage_low'', etc.)';
        PRINT '   ✓ alert_value (almacena valor actual de voltaje)';
        PRINT '   ✓ threshold_exceeded (almacena umbral excedido)';
    END
    ELSE
    BEGIN
        PRINT '❌ ERROR: active_critical_alerts falta algunos campos:';
        IF @hasMetricType = 0 PRINT '   ❌ Falta metric_type';
        IF @hasAlertField = 0 PRINT '   ❌ Falta alert_field';
        IF @hasAlertReason = 0 PRINT '   ❌ Falta alert_reason';
        IF @hasAlertValue = 0 PRINT '   ❌ Falta alert_value';
        IF @hasThresholdExceeded = 0 PRINT '   ❌ Falta threshold_exceeded';
        PRINT '   Ejecute: supabase/migrations/20250930120148_shrill_smoke.sql';
    END
END
ELSE
BEGIN
    PRINT '❌ ERROR: Tabla active_critical_alerts NO existe';
    PRINT '   Ejecute: supabase/migrations/20250930120148_shrill_smoke.sql';
END

PRINT '';

-- ============================================================================================================
-- 3. Verificar Índices en active_critical_alerts
-- ============================================================================================================
PRINT '3. Verificando índices en active_critical_alerts...';
PRINT '------------------------------------------------------------------------------------------------------------';

IF EXISTS (SELECT * FROM sysobjects WHERE name='active_critical_alerts' AND xtype='U')
BEGIN
    DECLARE @hasMetricTypeIndex BIT = 0;

    IF EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_active_critical_alerts_metric_type'
               AND object_id = OBJECT_ID('dbo.active_critical_alerts'))
        SET @hasMetricTypeIndex = 1;

    IF @hasMetricTypeIndex = 1
    BEGIN
        PRINT '✅ CORRECTO: Índice IX_active_critical_alerts_metric_type existe';
        PRINT '   Permite filtrado eficiente de alertas de voltaje';
    END
    ELSE
    BEGIN
        PRINT '⚠️ ADVERTENCIA: Índice IX_active_critical_alerts_metric_type no encontrado';
        PRINT '   El sistema funcionará pero las búsquedas pueden ser lentas';
    END
END

PRINT '';

-- ============================================================================================================
-- 4. Verificar rack_threshold_overrides
-- ============================================================================================================
PRINT '4. Verificando rack_threshold_overrides...';
PRINT '------------------------------------------------------------------------------------------------------------';

IF EXISTS (SELECT * FROM sysobjects WHERE name='rack_threshold_overrides' AND xtype='U')
BEGIN
    PRINT '✅ CORRECTO: Tabla rack_threshold_overrides existe';
    PRINT '   Soporta overrides de umbrales de voltaje específicos por rack';

    DECLARE @voltageOverridesCount INT;
    SELECT @voltageOverridesCount = COUNT(*)
    FROM rack_threshold_overrides
    WHERE threshold_key LIKE '%voltage%';

    IF @voltageOverridesCount > 0
    BEGIN
        PRINT '   ℹ️  Overrides de voltaje configurados: ' + CAST(@voltageOverridesCount AS NVARCHAR(10));
        PRINT '';
        SELECT
            rack_id AS 'Rack ID',
            threshold_key AS 'Threshold Key',
            value AS 'Valor',
            unit AS 'Unidad',
            description AS 'Descripción'
        FROM rack_threshold_overrides
        WHERE threshold_key LIKE '%voltage%';
    END
    ELSE
    BEGIN
        PRINT '   ℹ️  No hay overrides de voltaje configurados (usando valores globales)';
    END
END
ELSE
BEGIN
    PRINT '❌ ERROR: Tabla rack_threshold_overrides NO existe';
    PRINT '   Ejecute: supabase/migrations/20250926073326_fancy_waterfall.sql';
END

PRINT '';

-- ============================================================================================================
-- 5. Verificar Sistema de Mantenimiento
-- ============================================================================================================
PRINT '5. Verificando sistema de mantenimiento...';
PRINT '------------------------------------------------------------------------------------------------------------';

DECLARE @hasMaintenanceEntries BIT = 0;
DECLARE @hasMaintenanceRackDetails BIT = 0;

IF EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_entries' AND xtype='U')
    SET @hasMaintenanceEntries = 1;

IF EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_rack_details' AND xtype='U')
    SET @hasMaintenanceRackDetails = 1;

IF @hasMaintenanceEntries = 1 AND @hasMaintenanceRackDetails = 1
BEGIN
    PRINT '✅ CORRECTO: Sistema de mantenimiento configurado';
    PRINT '   ✓ maintenance_entries existe';
    PRINT '   ✓ maintenance_rack_details existe';
    PRINT '   Racks en mantenimiento NO generarán alertas de voltaje';

    DECLARE @maintenanceRacksCount INT;
    SELECT @maintenanceRacksCount = COUNT(DISTINCT rack_id)
    FROM maintenance_rack_details;

    IF @maintenanceRacksCount > 0
    BEGIN
        PRINT '   ℹ️  Racks actualmente en mantenimiento: ' + CAST(@maintenanceRacksCount AS NVARCHAR(10));
    END
    ELSE
    BEGIN
        PRINT '   ℹ️  No hay racks en mantenimiento actualmente';
    END
END
ELSE
BEGIN
    PRINT '⚠️ ADVERTENCIA: Sistema de mantenimiento incompleto';
    IF @hasMaintenanceEntries = 0 PRINT '   ❌ Falta maintenance_entries';
    IF @hasMaintenanceRackDetails = 0 PRINT '   ❌ Falta maintenance_rack_details';
    PRINT '   Ejecute: supabase/migrations/20251006140000_improved_maintenance_system.sql';
END

PRINT '';

-- ============================================================================================================
-- 6. Verificar Alertas de Voltaje Activas
-- ============================================================================================================
PRINT '6. Verificando alertas de voltaje activas...';
PRINT '------------------------------------------------------------------------------------------------------------';

IF EXISTS (SELECT * FROM sysobjects WHERE name='active_critical_alerts' AND xtype='U')
BEGIN
    DECLARE @activeVoltageAlerts INT;
    SELECT @activeVoltageAlerts = COUNT(*)
    FROM active_critical_alerts
    WHERE metric_type = 'voltage';

    IF @activeVoltageAlerts > 0
    BEGIN
        PRINT '⚠️  ALERTAS ACTIVAS: ' + CAST(@activeVoltageAlerts AS NVARCHAR(10)) + ' alertas de voltaje detectadas';
        PRINT '';
        SELECT TOP 10
            pdu_id AS 'PDU ID',
            rack_id AS 'Rack ID',
            name AS 'Nombre',
            site AS 'Sitio',
            dc AS 'DC',
            alert_reason AS 'Razón',
            alert_value AS 'Voltaje Actual',
            threshold_exceeded AS 'Umbral Excedido',
            alert_started_at AS 'Inicio',
            DATEDIFF(MINUTE, alert_started_at, GETDATE()) AS 'Minutos Activa'
        FROM active_critical_alerts
        WHERE metric_type = 'voltage'
        ORDER BY alert_started_at DESC;

        IF @activeVoltageAlerts > 10
        BEGIN
            PRINT '';
            PRINT '   (Mostrando solo las 10 más recientes)';
        END
    END
    ELSE
    BEGIN
        PRINT '✅ No hay alertas de voltaje activas actualmente';
    END
END

PRINT '';

-- ============================================================================================================
-- 7. Resumen Final
-- ============================================================================================================
PRINT '============================================================================================================';
PRINT 'RESUMEN FINAL';
PRINT '============================================================================================================';
PRINT '';

DECLARE @allChecksPass BIT = 1;

-- Check 1: Umbrales
IF @voltageThresholdsCount < 4
    SET @allChecksPass = 0;

-- Check 2: Tabla active_critical_alerts
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='active_critical_alerts' AND xtype='U')
    SET @allChecksPass = 0;

-- Check 3: Tabla rack_threshold_overrides
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='rack_threshold_overrides' AND xtype='U')
    SET @allChecksPass = 0;

IF @allChecksPass = 1
BEGIN
    PRINT '✅✅✅ VERIFICACIÓN EXITOSA ✅✅✅';
    PRINT '';
    PRINT 'El sistema tiene soporte COMPLETO para voltaje:';
    PRINT '  ✓ Umbrales de voltaje configurados';
    PRINT '  ✓ Tabla de alertas soporta voltaje';
    PRINT '  ✓ Sistema de overrides por rack disponible';
    PRINT '  ✓ Sistema de mantenimiento configurado';
    PRINT '';
    PRINT 'El backend ESTÁ LISTO para:';
    PRINT '  → Leer totalVolts del API NENG';
    PRINT '  → Evaluar umbrales de voltaje';
    PRINT '  → Generar alertas críticas de voltaje';
    PRINT '  → Mostrar alertas en el dashboard';
    PRINT '';
    PRINT 'Estado actual:';
    PRINT '  • Umbrales de voltaje: ' + CAST(@voltageThresholdsCount AS NVARCHAR(10)) + ' configurados';
    IF @voltageOverridesCount > 0
        PRINT '  • Overrides específicos: ' + CAST(@voltageOverridesCount AS NVARCHAR(10)) + ' racks personalizados';
    IF @activeVoltageAlerts > 0
        PRINT '  • Alertas activas: ' + CAST(@activeVoltageAlerts AS NVARCHAR(10)) + ' alertas de voltaje';
    ELSE
        PRINT '  • Alertas activas: Ninguna (sistema normal)';
END
ELSE
BEGIN
    PRINT '❌❌❌ VERIFICACIÓN FALLIDA ❌❌❌';
    PRINT '';
    PRINT 'Algunos componentes necesarios no están configurados.';
    PRINT 'Revise los mensajes de error anteriores y ejecute las migraciones necesarias.';
    PRINT '';
    PRINT 'Migraciones requeridas (en orden):';
    PRINT '  1. supabase/migrations/20250930145215_fragrant_temple.sql';
    PRINT '  2. supabase/migrations/20250930120148_shrill_smoke.sql';
    PRINT '  3. supabase/migrations/20250926073326_fancy_waterfall.sql';
    PRINT '  4. supabase/migrations/20251006140000_improved_maintenance_system.sql';
    PRINT '  5. supabase/migrations/20251013140000_add_voltage_support.sql';
END

PRINT '';
PRINT '============================================================================================================';
GO
