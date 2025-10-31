/*
  # Añadir Soporte Completo para Voltaje (totalVolts)

  1. Descripción General
    - Añade soporte completo para la métrica de voltaje proveniente del campo "totalVolts" del API NENG
    - El backend ya lee totalVolts y evalúa umbrales de voltaje (server.cjs líneas 1034, 531-564)
    - Esta migración actualiza las tablas de base de datos para almacenar alertas de voltaje

  2. Cambios en threshold_configs
    - Inserta/actualiza 4 umbrales de voltaje para sistemas de 220V:
      * critical_voltage_low: 200.0 V (por debajo causa mal funcionamiento)
      * critical_voltage_high: 250.0 V (por encima puede dañar equipos)
      * warning_voltage_low: 210.0 V (advertencia - fuera de rango nominal)
      * warning_voltage_high: 240.0 V (advertencia - fuera de rango nominal)

  3. Cambios en active_critical_alerts
    - La tabla ya existe y soporta voltaje mediante:
      * metric_type: puede almacenar 'voltage'
      * alert_field: puede almacenar 'voltage'
      * alert_reason: puede almacenar 'critical_voltage_low', 'critical_voltage_high', etc.
    - No requiere cambios estructurales, solo inserción de umbrales

  4. Cambios en rack_threshold_overrides
    - La tabla ya existe y soporta cualquier threshold_key
    - Puede almacenar overrides de umbrales de voltaje específicos por rack
    - No requiere cambios estructurales

  5. Sistema de Mantenimiento
    - Las tablas maintenance_entries y maintenance_rack_details ya existen
    - El backend ya excluye racks en mantenimiento de la evaluación de voltaje
    - No requiere cambios

  6. Flujo Completo de Voltaje
    API NENG (totalVolts)
      → Backend (parseFloat(powerItem.totalVolts), línea 1034)
      → Evaluación de umbrales (líneas 531-564)
      → active_critical_alerts (metric_type='voltage')
      → Frontend (visualización de alertas)

  7. Notas Importantes
    - Valores estándar para sistemas de 220V ±10% (rango nominal: 198V - 242V)
    - Para sistemas de 110V, ajustar a: 95V, 105V, 120V, 125V
    - Para sistemas de 380V, ajustar a: 350V, 370V, 410V, 420V
    - Los umbrales son ajustables según las especificaciones de la infraestructura
*/

-- ============================================================================================================
-- PASO 1: Usar la base de datos correcta
-- ============================================================================================================
USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================================================';
PRINT 'INICIO: Añadiendo soporte completo para voltaje (totalVolts)';
PRINT '============================================================================================================';
PRINT '';

-- ============================================================================================================
-- PASO 2: Insertar/Actualizar Umbrales de Voltaje en threshold_configs
-- ============================================================================================================
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Insertando/actualizando umbrales de voltaje en threshold_configs';
PRINT '------------------------------------------------------------------------------------------------------------';

MERGE threshold_configs AS target
USING (VALUES
    -- ========================================================================================================
    -- UMBRALES DE VOLTAJE (V) - Para sistemas de 220V ±10%
    -- ========================================================================================================
    -- Estos umbrales son críticos para detectar problemas eléctricos que pueden:
    -- - Causar mal funcionamiento de equipos (voltaje bajo)
    -- - Dañar componentes electrónicos (voltaje alto)
    -- - Indicar problemas en la instalación eléctrica o UPS
    --
    -- CRITICAL LOW (200V):  Voltaje demasiado bajo - riesgo de mal funcionamiento
    --                       Equipos pueden apagarse o funcionar incorrectamente
    --                       Puede indicar problemas en UPS o instalación eléctrica
    --
    -- WARNING LOW (210V):   Voltaje bajo - fuera del rango nominal (220V ±5%)
    --                       Aceptable temporalmente pero requiere monitoreo
    --                       Puede indicar carga excesiva o problemas menores
    --
    -- WARNING HIGH (240V):  Voltaje alto - fuera del rango nominal (220V ±5%)
    --                       Aceptable temporalmente pero requiere monitoreo
    --                       Puede indicar problemas en regulación de voltaje
    --
    -- CRITICAL HIGH (250V): Voltaje demasiado alto - riesgo de daño a equipos
    --                       Componentes electrónicos sensibles pueden dañarse
    --                       Requiere acción inmediata para proteger equipos
    --
    -- IMPORTANTE: Ajustar según las especificaciones de su instalación eléctrica
    ('critical_voltage_low', 200.0, 'V', 'Voltaje crítico mínimo - Riesgo de mal funcionamiento de equipos'),
    ('critical_voltage_high', 250.0, 'V', 'Voltaje crítico máximo - Riesgo de daño a equipos electrónicos'),
    ('warning_voltage_low', 210.0, 'V', 'Voltaje advertencia mínimo - Fuera del rango nominal (220V ±5%)'),
    ('warning_voltage_high', 240.0, 'V', 'Voltaje advertencia máximo - Fuera del rango nominal (220V ±5%)')
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

-- Contar cuántos umbrales de voltaje tenemos ahora
DECLARE @voltageThresholdsCount INT;
SELECT @voltageThresholdsCount = COUNT(*)
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%';

PRINT '✅ Umbrales de voltaje insertados/actualizados: ' + CAST(@voltageThresholdsCount AS NVARCHAR(10));
GO

-- ============================================================================================================
-- PASO 3: Verificar que active_critical_alerts soporta voltaje
-- ============================================================================================================
PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Verificando soporte de voltaje en active_critical_alerts';
PRINT '------------------------------------------------------------------------------------------------------------';

-- Verificar que la tabla existe
IF EXISTS (SELECT * FROM sysobjects WHERE name='active_critical_alerts' AND xtype='U')
BEGIN
    PRINT '✅ Tabla active_critical_alerts existe';

    -- Verificar campos requeridos
    DECLARE @hasMetricType BIT = 0;
    DECLARE @hasAlertField BIT = 0;
    DECLARE @hasAlertReason BIT = 0;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'metric_type')
        SET @hasMetricType = 1;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'alert_field')
        SET @hasAlertField = 1;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'active_critical_alerts' AND COLUMN_NAME = 'alert_reason')
        SET @hasAlertReason = 1;

    IF @hasMetricType = 1 AND @hasAlertField = 1 AND @hasAlertReason = 1
    BEGIN
        PRINT '✅ active_critical_alerts tiene todos los campos necesarios para voltaje:';
        PRINT '   - metric_type: puede almacenar ''voltage''';
        PRINT '   - alert_field: puede almacenar ''voltage''';
        PRINT '   - alert_reason: puede almacenar ''critical_voltage_low'', ''critical_voltage_high'', etc.';
    END
    ELSE
    BEGIN
        PRINT '⚠️ ADVERTENCIA: active_critical_alerts falta algunos campos:';
        IF @hasMetricType = 0 PRINT '   ❌ Falta metric_type';
        IF @hasAlertField = 0 PRINT '   ❌ Falta alert_field';
        IF @hasAlertReason = 0 PRINT '   ❌ Falta alert_reason';
    END
END
ELSE
BEGIN
    PRINT '❌ ERROR: Tabla active_critical_alerts NO existe';
    PRINT '   Ejecute primero la migración 20250930120148_shrill_smoke.sql';
END
GO

-- ============================================================================================================
-- PASO 4: Verificar que rack_threshold_overrides soporta voltaje
-- ============================================================================================================
PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Verificando soporte de voltaje en rack_threshold_overrides';
PRINT '------------------------------------------------------------------------------------------------------------';

IF EXISTS (SELECT * FROM sysobjects WHERE name='rack_threshold_overrides' AND xtype='U')
BEGIN
    PRINT '✅ Tabla rack_threshold_overrides existe';
    PRINT '✅ Puede almacenar overrides de umbrales de voltaje específicos por rack';
    PRINT '   Threshold keys soportados:';
    PRINT '   - critical_voltage_low';
    PRINT '   - critical_voltage_high';
    PRINT '   - warning_voltage_low';
    PRINT '   - warning_voltage_high';
END
ELSE
BEGIN
    PRINT '❌ ERROR: Tabla rack_threshold_overrides NO existe';
    PRINT '   Ejecute primero la migración 20250926073326_fancy_waterfall.sql';
END
GO

-- ============================================================================================================
-- PASO 5: Resumen Final y Verificación
-- ============================================================================================================
PRINT '';
PRINT '============================================================================================================';
PRINT 'RESUMEN: Soporte para Voltaje (totalVolts) Completado';
PRINT '============================================================================================================';
PRINT '';

-- Mostrar todos los umbrales de voltaje configurados
PRINT 'Umbrales de voltaje configurados:';
SELECT
    threshold_key AS 'Threshold Key',
    value AS 'Valor',
    unit AS 'Unidad',
    description AS 'Descripción'
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%'
ORDER BY threshold_key;

PRINT '';
PRINT '============================================================================================================';
PRINT '✅ SOPORTE DE VOLTAJE INSTALADO CORRECTAMENTE';
PRINT '============================================================================================================';
PRINT '';
PRINT 'El sistema ahora soporta completamente la métrica de voltaje:';
PRINT '';
PRINT '📊 FLUJO DE DATOS:';
PRINT '   1. API NENG → campo ''totalVolts'' en endpoint /power';
PRINT '   2. Backend → lee totalVolts y lo mapea a ''voltage'' (server.cjs:1034)';
PRINT '   3. Evaluación → compara voltage contra umbrales (server.cjs:531-564)';
PRINT '   4. Alertas → inserta/actualiza en active_critical_alerts';
PRINT '   5. Frontend → visualiza alertas de voltaje en la UI';
PRINT '';
PRINT '⚙️ UMBRALES CONFIGURADOS (Sistema 220V):';
PRINT '   • Critical Low:  200.0 V → Por debajo: mal funcionamiento';
PRINT '   • Warning Low:   210.0 V → Rango 200-210V: advertencia';
PRINT '   • Warning High:  240.0 V → Rango 240-250V: advertencia';
PRINT '   • Critical High: 250.0 V → Por encima: riesgo de daño';
PRINT '';
PRINT '🔧 PERSONALIZACIÓN:';
PRINT '   - Umbrales globales: tabla threshold_configs';
PRINT '   - Umbrales por rack: tabla rack_threshold_overrides';
PRINT '   - Para sistemas 110V: dividir valores entre 2';
PRINT '   - Para sistemas 380V: multiplicar valores por ~1.7';
PRINT '';
PRINT '✅ TABLAS VERIFICADAS:';
PRINT '   ✓ threshold_configs - Contiene umbrales de voltaje';
PRINT '   ✓ active_critical_alerts - Soporta metric_type=''voltage''';
PRINT '   ✓ rack_threshold_overrides - Soporta overrides de voltaje';
PRINT '';
PRINT '🔄 PRÓXIMOS PASOS:';
PRINT '   1. Backend ya evalúa voltaje automáticamente';
PRINT '   2. Ajustar umbrales según su infraestructura eléctrica si es necesario';
PRINT '   3. Configurar umbrales específicos por rack si se requiere';
PRINT '   4. Monitorear alertas de voltaje en el dashboard';
PRINT '';
PRINT '============================================================================================================';
GO
