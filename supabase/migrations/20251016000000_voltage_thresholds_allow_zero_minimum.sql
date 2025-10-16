/*
  # Actualizar Umbrales de Voltaje - Permitir 0V como Mínimo Válido

  1. Descripción General
    - Los umbrales de voltaje mínimo (crítico y advertencia) se actualizan a 0V
    - Esto refleja que el valor mínimo de voltaje válido siempre será 0V
    - Los umbrales máximos permanecen sin cambios
    - Esta configuración es estándar para sistemas de monitoreo de voltaje

  2. Cambios en threshold_configs
    - Actualiza critical_voltage_low de 200.0V a 0.0V
    - Actualiza warning_voltage_low de 210.0V a 0.0V
    - Los umbrales altos permanecen:
      * warning_voltage_high: 240.0V
      * critical_voltage_high: 250.0V

  3. Justificación Técnica
    - Un voltaje de 0V indica ausencia total de energía (condición crítica válida)
    - No tiene sentido alertar por voltaje menor a un valor mínimo cuando 0V es válido
    - El sistema debe detectar principalmente sobrevoltaje (valores altos peligrosos)
    - Los equipos se apagan o no funcionan cuando el voltaje cae a 0V, pero esto no es una "alerta por bajo voltaje" sino una condición de "sin energía"

  4. Comportamiento Esperado
    - Voltaje = 0V: Condición normal (sin energía, sin alerta de bajo voltaje)
    - Voltaje entre 0V y 240V: Operación normal
    - Voltaje entre 240V y 250V: Advertencia (sobrevoltaje leve)
    - Voltaje > 250V: Crítico (sobrevoltaje peligroso)

  5. Compatibilidad
    - Compatible con sistemas de 110V, 220V, 380V
    - Los umbrales máximos deben ajustarse según el voltaje nominal del sistema
    - Los umbrales mínimos siempre serán 0V independientemente del sistema
*/

-- ============================================================================================================
-- PASO 1: Usar la base de datos correcta
-- ============================================================================================================
USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================================================';
PRINT 'INICIO: Actualizando umbrales de voltaje para permitir 0V como mínimo válido';
PRINT '============================================================================================================';
PRINT '';

-- ============================================================================================================
-- PASO 2: Actualizar Umbrales Mínimos de Voltaje a 0V
-- ============================================================================================================
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Actualizando umbrales mínimos de voltaje en threshold_configs';
PRINT '------------------------------------------------------------------------------------------------------------';

-- Actualizar critical_voltage_low a 0V
UPDATE threshold_configs
SET
    value = 0.0,
    description = 'Voltaje crítico mínimo - 0V es el valor mínimo válido (sin energía)',
    updated_at = GETDATE()
WHERE threshold_key = 'critical_voltage_low';

PRINT '✅ critical_voltage_low actualizado a 0.0V';

-- Actualizar warning_voltage_low a 0V
UPDATE threshold_configs
SET
    value = 0.0,
    description = 'Voltaje advertencia mínimo - 0V es el valor mínimo válido (sin energía)',
    updated_at = GETDATE()
WHERE threshold_key = 'warning_voltage_low';

PRINT '✅ warning_voltage_low actualizado a 0.0V';
GO

-- ============================================================================================================
-- PASO 3: Verificar Configuración Actualizada
-- ============================================================================================================
PRINT '';
PRINT '------------------------------------------------------------------------------------------------------------';
PRINT 'Verificando configuración actualizada de umbrales de voltaje';
PRINT '------------------------------------------------------------------------------------------------------------';

SELECT
    threshold_key AS 'Threshold Key',
    value AS 'Valor (V)',
    unit AS 'Unidad',
    description AS 'Descripción',
    updated_at AS 'Última Actualización'
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%'
ORDER BY
    CASE
        WHEN threshold_key = 'critical_voltage_low' THEN 1
        WHEN threshold_key = 'warning_voltage_low' THEN 2
        WHEN threshold_key = 'warning_voltage_high' THEN 3
        WHEN threshold_key = 'critical_voltage_high' THEN 4
    END;

PRINT '';
PRINT '============================================================================================================';
PRINT 'RESUMEN: Umbrales de Voltaje Actualizados Correctamente';
PRINT '============================================================================================================';
PRINT '';

-- Contar umbrales actualizados
DECLARE @criticalLowValue DECIMAL(10, 2);
DECLARE @warningLowValue DECIMAL(10, 2);
DECLARE @warningHighValue DECIMAL(10, 2);
DECLARE @criticalHighValue DECIMAL(10, 2);

SELECT @criticalLowValue = value FROM threshold_configs WHERE threshold_key = 'critical_voltage_low';
SELECT @warningLowValue = value FROM threshold_configs WHERE threshold_key = 'warning_voltage_low';
SELECT @warningHighValue = value FROM threshold_configs WHERE threshold_key = 'warning_voltage_high';
SELECT @criticalHighValue = value FROM threshold_configs WHERE threshold_key = 'critical_voltage_high';

PRINT '📊 CONFIGURACIÓN DE UMBRALES DE VOLTAJE:';
PRINT '';
PRINT '   Umbrales Mínimos (actualizados):';
PRINT '   • critical_voltage_low:  ' + CAST(@criticalLowValue AS NVARCHAR(10)) + ' V (sin energía = normal)';
PRINT '   • warning_voltage_low:   ' + CAST(@warningLowValue AS NVARCHAR(10)) + ' V (sin energía = normal)';
PRINT '';
PRINT '   Umbrales Máximos (sin cambios):';
PRINT '   • warning_voltage_high:  ' + CAST(@warningHighValue AS NVARCHAR(10)) + ' V (advertencia sobrevoltaje)';
PRINT '   • critical_voltage_high: ' + CAST(@criticalHighValue AS NVARCHAR(10)) + ' V (crítico sobrevoltaje)';
PRINT '';
PRINT '⚙️ COMPORTAMIENTO ESPERADO:';
PRINT '   ✓ Voltaje = 0V          → Normal (sin energía, sin alerta)';
PRINT '   ✓ Voltaje 0V - 240V     → Normal (operación estándar)';
PRINT '   ⚠ Voltaje 240V - 250V   → Advertencia (sobrevoltaje leve)';
PRINT '   🚨 Voltaje > 250V       → Crítico (sobrevoltaje peligroso)';
PRINT '';
PRINT '📝 NOTAS IMPORTANTES:';
PRINT '   • El mínimo siempre es 0V independientemente del sistema (110V/220V/380V)';
PRINT '   • Los umbrales máximos deben ajustarse según el voltaje nominal';
PRINT '   • 0V indica ausencia de energía, no es una alerta de "bajo voltaje"';
PRINT '   • El sistema detecta principalmente sobrevoltaje que puede dañar equipos';
PRINT '';
PRINT '============================================================================================================';
PRINT '✅ ACTUALIZACIÓN COMPLETADA EXITOSAMENTE';
PRINT '============================================================================================================';
GO
