-- ============================================================================
-- ACTUALIZAR UMBRALES DE VOLTAJE CON VALORES POR DEFECTO
-- ============================================================================
-- Este script actualiza los umbrales de voltaje a valores razonables por defecto
-- Valores basados en el estándar europeo de 220V ±10%
-- ============================================================================

USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================';
PRINT 'Actualizando umbrales de voltaje a valores por defecto';
PRINT '============================================================================';
PRINT '';

-- Actualizar o insertar umbrales de voltaje con valores por defecto
MERGE threshold_configs AS target
USING (VALUES
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
GO

PRINT '✅ Umbrales de voltaje actualizados correctamente';
PRINT '';
PRINT 'Valores configurados:';
PRINT '  - Critical Low:  200V (voltaje por debajo = CRÍTICO)';
PRINT '  - Warning Low:   210V (voltaje por debajo = ADVERTENCIA)';
PRINT '  - Warning High:  240V (voltaje por encima = ADVERTENCIA)';
PRINT '  - Critical High: 250V (voltaje por encima = CRÍTICO)';
PRINT '';

-- Verificar umbrales insertados
PRINT '============================================================================';
PRINT 'Verificando umbrales de voltaje:';
PRINT '============================================================================';
PRINT '';

SELECT
    threshold_key as 'Umbral',
    value as 'Valor',
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
PRINT '📋 PRÓXIMOS PASOS:';
PRINT '   1. Reiniciar el servidor Node.js';
PRINT '   2. Refrescar la aplicación web';
PRINT '   3. Verificar los logs del servidor para el resumen de voltaje';
PRINT '';
PRINT '🔌 Los umbrales ahora están activos y las alertas de voltaje';
PRINT '   se generarán automáticamente cuando se superen estos valores.';
PRINT '';
PRINT '============================================================================';
