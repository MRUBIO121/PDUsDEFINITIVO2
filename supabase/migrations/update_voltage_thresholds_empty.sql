-- ============================================================================
-- ACTUALIZAR UMBRALES DE VOLTAJE A VALORES VACÍOS/NULOS
-- ============================================================================
-- Este script actualiza los umbrales de voltaje eliminando cualquier valor
-- por defecto. Los valores deben ser configurados manualmente desde la
-- aplicación web según las necesidades específicas de cada instalación.
-- ============================================================================

USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================';
PRINT 'Actualizando umbrales de voltaje - Eliminando valores por defecto';
PRINT '============================================================================';
PRINT '';

-- Verificar valores actuales antes de actualizar
PRINT '📋 Valores ANTES de la actualización:';
PRINT '--------------------------------------------';
SELECT
    threshold_key as 'Umbral',
    value as 'Valor Actual',
    unit as 'Unidad'
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%'
ORDER BY
    CASE threshold_key
        WHEN 'critical_voltage_low' THEN 1
        WHEN 'warning_voltage_low' THEN 2
        WHEN 'warning_voltage_high' THEN 3
        WHEN 'critical_voltage_high' THEN 4
    END;
GO

PRINT '';
PRINT '🔄 Actualizando umbrales de voltaje a NULL...';
PRINT '';

-- Actualizar umbrales de voltaje a NULL o 0
UPDATE threshold_configs
SET
    value = NULL,
    updated_at = GETDATE()
WHERE threshold_key IN (
    'critical_voltage_low',
    'critical_voltage_high',
    'warning_voltage_low',
    'warning_voltage_high'
);
GO

PRINT '';
PRINT '📋 Valores DESPUÉS de la actualización:';
PRINT '--------------------------------------------';
SELECT
    threshold_key as 'Umbral',
    value as 'Valor Actual',
    unit as 'Unidad',
    description as 'Descripción'
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%'
ORDER BY
    CASE threshold_key
        WHEN 'critical_voltage_low' THEN 1
        WHEN 'warning_voltage_low' THEN 2
        WHEN 'warning_voltage_high' THEN 3
        WHEN 'critical_voltage_high' THEN 4
    END;
GO

PRINT '';
PRINT '============================================================================';
PRINT '✅ ACTUALIZACIÓN COMPLETADA';
PRINT '============================================================================';
PRINT '';
PRINT '⚠️  IMPORTANTE:';
PRINT '   Los umbrales de voltaje ahora están en NULL/vacíos.';
PRINT '   NO se generarán alertas de voltaje hasta que configures';
PRINT '   los valores apropiados para tu instalación.';
PRINT '';
PRINT '📋 PRÓXIMOS PASOS:';
PRINT '   1. Acceder a la aplicación web';
PRINT '   2. Ir a la sección de "Gestión de Umbrales"';
PRINT '   3. Configurar manualmente los umbrales de voltaje según:';
PRINT '      - Especificaciones de tus equipos';
PRINT '      - Estándares eléctricos de tu región';
PRINT '      - Requisitos operacionales';
PRINT '';
PRINT '💡 EJEMPLO DE VALORES COMUNES:';
PRINT '   Europa (230V sistema): 200V / 210V / 240V / 250V';
PRINT '   América (120V sistema): 100V / 105V / 125V / 130V';
PRINT '   Ajusta según tus necesidades específicas.';
PRINT '';
PRINT '============================================================================';
