/*
  # Actualizar Umbrales de Voltaje - Configurar 0V como Umbral Mínimo Crítico

  1. Descripción General
    - Los umbrales de voltaje mínimo se actualizan para detectar condición de "sin energía"
    - 0V es una condición CRÍTICA que debe generar alerta (ausencia total de energía)
    - Los umbrales máximos detectan sobrevoltaje peligroso
    - Esta configuración permite detectar tanto falta de energía como sobrevoltaje

  2. Cambios en threshold_configs
    - Actualiza critical_voltage_low a 0.0V (sin energía = crítico)
    - Actualiza warning_voltage_low a 0.0V (sin energía = crítico)
    - Los umbrales altos permanecen:
      * warning_voltage_high: 240.0V (sobrevoltaje leve)
      * critical_voltage_high: 250.0V (sobrevoltaje peligroso)

  3. Comportamiento Esperado del Sistema
    - Voltaje = 0V: ALERTA CRÍTICA (sin energía, equipo apagado o desconectado)
    - Voltaje entre 0V y 240V: Operación NORMAL
    - Voltaje entre 240V y 250V: ADVERTENCIA (sobrevoltaje leve)
    - Voltaje > 250V: CRÍTICO (sobrevoltaje peligroso, riesgo de daño)

  4. Diferencia con Amperaje
    - Amperaje 0A: Normal (sin carga, equipo apagado = condición esperada)
    - Voltaje 0V: Crítico (sin energía, PDU desconectado = problema eléctrico)

  5. Justificación Técnica
    - 0V indica falta de alimentación eléctrica (problema crítico del sistema)
    - 0A indica simplemente que no hay consumo (condición normal de operación)
    - Los PDUs deben tener voltaje presente aunque no haya carga
    - Detectar 0V permite identificar desconexiones, fallos de UPS, o cortes de energía

  6. Compatibilidad
    - Compatible con sistemas de 110V, 220V, 380V
    - Los umbrales máximos deben ajustarse según el voltaje nominal del sistema
    - El umbral mínimo crítico (0V) es universal para todos los sistemas
*/

-- ============================================================================================================
-- PASO 1: Usar la base de datos correcta
-- ============================================================================================================
USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================================================';
PRINT 'INICIO: Configurando umbrales de voltaje para detectar sin energía (0V)';
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
    description = 'Voltaje crítico mínimo - 0V indica ausencia total de energía (genera alerta crítica)',
    updated_at = GETDATE()
WHERE threshold_key = 'critical_voltage_low';

PRINT '✅ critical_voltage_low actualizado a 0.0V (sin energía = alerta crítica)';

-- Actualizar warning_voltage_low a 0V
UPDATE threshold_configs
SET
    value = 0.0,
    description = 'Voltaje advertencia mínimo - 0V indica ausencia total de energía (genera alerta crítica)',
    updated_at = GETDATE()
WHERE threshold_key = 'warning_voltage_low';

PRINT '✅ warning_voltage_low actualizado a 0.0V (sin energía = alerta crítica)';
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
PRINT 'RESUMEN: Umbrales de Voltaje Configurados Correctamente';
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
PRINT '   Umbrales Mínimos (detectan sin energía):';
PRINT '   • critical_voltage_low:  ' + CAST(@criticalLowValue AS NVARCHAR(10)) + ' V → 0V = ALERTA CRÍTICA';
PRINT '   • warning_voltage_low:   ' + CAST(@warningLowValue AS NVARCHAR(10)) + ' V → 0V = ALERTA CRÍTICA';
PRINT '';
PRINT '   Umbrales Máximos (detectan sobrevoltaje):';
PRINT '   • warning_voltage_high:  ' + CAST(@warningHighValue AS NVARCHAR(10)) + ' V → sobrevoltaje leve';
PRINT '   • critical_voltage_high: ' + CAST(@criticalHighValue AS NVARCHAR(10)) + ' V → sobrevoltaje peligroso';
PRINT '';
PRINT '⚙️ COMPORTAMIENTO ESPERADO:';
PRINT '   🚨 Voltaje = 0V          → CRÍTICO (sin energía, PDU desconectado o fallo eléctrico)';
PRINT '   ✓ Voltaje 0V - 240V     → Normal (operación estándar)';
PRINT '   ⚠ Voltaje 240V - 250V   → Advertencia (sobrevoltaje leve)';
PRINT '   🚨 Voltaje > 250V       → Crítico (sobrevoltaje peligroso)';
PRINT '';
PRINT '📝 DIFERENCIA CON AMPERAJE:';
PRINT '   • Amperaje 0A:  Normal (sin carga, no genera alerta)';
PRINT '   • Voltaje 0V:   CRÍTICO (sin energía, SÍ genera alerta)';
PRINT '';
PRINT '🔧 NOTAS TÉCNICAS:';
PRINT '   • 0V indica falta de alimentación eléctrica (problema del sistema)';
PRINT '   • 0A indica simplemente que no hay consumo (operación normal)';
PRINT '   • Los PDUs deben tener voltaje presente aunque no tengan carga';
PRINT '   • Detectar 0V identifica: desconexiones, fallos UPS, cortes de energía';
PRINT '';
PRINT '============================================================================================================';
PRINT '✅ ACTUALIZACIÓN COMPLETADA EXITOSAMENTE';
PRINT '============================================================================================================';
GO
