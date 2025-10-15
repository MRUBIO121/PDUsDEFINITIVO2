-- ============================================================================
-- ARCHIVO: add_voltage_thresholds.sql
-- PROPOSITO: Añadir umbrales de voltaje (totalVolts) al sistema de monitoreo
-- FECHA: 2025-10-09
-- ============================================================================
-- IMPORTANTE: Los valores se establecen en 0.0 y DEBEN ser configurados
-- manualmente desde la interfaz de administración de umbrales.
-- NO SE PROPORCIONAN VALORES POR DEFECTO para evitar falsas alarmas.
-- ============================================================================

USE energy_monitor_db;
GO

-- ============================================================================
-- INICIO: Añadir Umbrales de Voltaje a threshold_configs
-- ============================================================================
-- Este query añade los umbrales de voltaje (totalVolts) a la configuración
-- global de umbrales en la tabla threshold_configs.
--
-- Los umbrales que se añaden son:
--   1. critical_voltage_low  - Voltaje crítico mínimo (V)
--   2. critical_voltage_high - Voltaje crítico máximo (V)
--   3. warning_voltage_low   - Voltaje advertencia mínimo (V)
--   4. warning_voltage_high  - Voltaje advertencia máximo (V)
-- ============================================================================

PRINT '';
PRINT '============================================================================';
PRINT 'Añadiendo umbrales de voltaje a threshold_configs';
PRINT '============================================================================';
PRINT '';

-- Insertar umbrales de voltaje en threshold_configs
-- NOTA: Los valores se establecen en 0.0 para forzar configuración manual
MERGE threshold_configs AS target
USING (VALUES
    ('critical_voltage_low', 0.0, 'V', 'Voltaje crítico mínimo - DEBE SER CONFIGURADO'),
    ('critical_voltage_high', 0.0, 'V', 'Voltaje crítico máximo - DEBE SER CONFIGURADO'),
    ('warning_voltage_low', 0.0, 'V', 'Voltaje advertencia mínimo - DEBE SER CONFIGURADO'),
    ('warning_voltage_high', 0.0, 'V', 'Voltaje advertencia máximo - DEBE SER CONFIGURADO')
) AS source (threshold_key, value, unit, description)
ON target.threshold_key = source.threshold_key
WHEN NOT MATCHED THEN
    INSERT (threshold_key, value, unit, description)
    VALUES (source.threshold_key, source.value, source.unit, source.description);
GO

PRINT '✅ Umbrales de voltaje añadidos correctamente a threshold_configs';
PRINT '';
PRINT '⚠️  IMPORTANTE: Los umbrales de voltaje tienen valor 0.0';
PRINT '⚠️  DEBEN ser configurados manualmente desde la interfaz web';
PRINT '⚠️  antes de que las alertas de voltaje funcionen correctamente.';
PRINT '';

-- ============================================================================
-- FIN: Añadir Umbrales de Voltaje
-- ============================================================================


-- ============================================================================
-- INICIO: Verificación de umbrales insertados
-- ============================================================================
-- Consulta para verificar que los umbrales de voltaje se insertaron
-- correctamente en la base de datos
-- ============================================================================

PRINT '============================================================================';
PRINT 'Verificando umbrales de voltaje insertados:';
PRINT '============================================================================';
PRINT '';

SELECT
    threshold_key as 'Clave de Umbral',
    value as 'Valor',
    unit as 'Unidad',
    description as 'Descripción',
    FORMAT(created_at, 'yyyy-MM-dd HH:mm:ss') as 'Fecha Creación',
    FORMAT(updated_at, 'yyyy-MM-dd HH:mm:ss') as 'Fecha Actualización'
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%'
ORDER BY threshold_key;
GO

PRINT '';
PRINT '============================================================================';
PRINT 'Verificación completada';
PRINT '============================================================================';
PRINT '';

-- ============================================================================
-- FIN: Verificación
-- ============================================================================


-- ============================================================================
-- NOTAS ADICIONALES
-- ============================================================================
--
-- 1. ESTRUCTURA DE DATOS:
--    - NO se requieren cambios en otras tablas de la base de datos
--    - La tabla 'rack_threshold_overrides' ya soporta cualquier threshold_key
--    - La tabla 'active_critical_alerts' ya soporta cualquier metric_type
--
-- 2. UMBRALES POR RACK:
--    - Los umbrales específicos por rack se pueden configurar desde la interfaz
--    - Se almacenarán automáticamente en 'rack_threshold_overrides'
--    - Tienen prioridad sobre los umbrales globales
--
-- 3. ALERTAS:
--    - Las alertas de voltaje se generarán automáticamente cuando:
--      * El voltaje esté por debajo de critical_voltage_low
--      * El voltaje esté por encima de critical_voltage_high
--      * El voltaje esté por debajo de warning_voltage_low
--      * El voltaje esté por encima de warning_voltage_high
--    - Las alertas se almacenarán en 'active_critical_alerts'
--
-- 4. CONFIGURACIÓN RECOMENDADA:
--    - Revisar la documentación de la API NENG para conocer rangos típicos
--    - Configurar valores apropiados según la infraestructura eléctrica
--    - Ejemplo típico para sistemas 220V:
--      * critical_voltage_low: 200V
--      * warning_voltage_low: 210V
--      * warning_voltage_high: 240V
--      * critical_voltage_high: 250V
--
-- 5. PRÓXIMOS PASOS:
--    a) Ejecutar este script SQL en el servidor de base de datos
--    b) Desplegar la aplicación actualizada (frontend + backend)
--    c) Configurar los umbrales de voltaje desde la interfaz web
--    d) Verificar que las alertas de voltaje funcionan correctamente
--
-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
