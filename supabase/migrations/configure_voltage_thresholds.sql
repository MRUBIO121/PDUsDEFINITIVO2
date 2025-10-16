-- ============================================================================
-- CONFIGURAR UMBRALES DE VOLTAJE
-- ============================================================================
-- Este script verifica y configura los umbrales de voltaje en la base de datos
-- DEBES AJUSTAR LOS VALORES según tus necesidades específicas
-- ============================================================================

USE energy_monitor_db;
GO

PRINT '';
PRINT '============================================================================';
PRINT 'VERIFICACIÓN Y CONFIGURACIÓN DE UMBRALES DE VOLTAJE';
PRINT '============================================================================';
PRINT '';

-- Verificar valores actuales
PRINT '📋 PASO 1: Verificando valores actuales...';
PRINT '--------------------------------------------';

IF EXISTS (SELECT 1 FROM threshold_configs WHERE threshold_key LIKE '%voltage%')
BEGIN
    SELECT
        threshold_key as 'Umbral',
        ISNULL(CAST(value AS VARCHAR), 'NULL') as 'Valor Actual',
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
END
ELSE
BEGIN
    PRINT '⚠️  No se encontraron umbrales de voltaje en la tabla';
END

PRINT '';
PRINT '📋 PASO 2: Configurando umbrales de voltaje...';
PRINT '--------------------------------------------';
PRINT '';
PRINT '⚠️  IMPORTANTE: Estos son valores de ejemplo para sistema 230V (Europa)';
PRINT '   Si tu sistema es diferente, modifica los valores en este script.';
PRINT '';

-- Configurar umbrales de voltaje
-- AJUSTA ESTOS VALORES SEGÚN TU SISTEMA ELÉCTRICO:
--
-- Europa (230V): 200, 210, 240, 250
-- América (120V): 100, 105, 125, 130
-- Otro: Consulta las especificaciones de tus equipos

MERGE threshold_configs AS target
USING (VALUES
    -- AJUSTA ESTOS VALORES SEGÚN TUS NECESIDADES:
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

PRINT '';
PRINT '✅ Umbrales configurados exitosamente';
PRINT '';

-- Verificar configuración final
PRINT '📋 PASO 3: Verificando configuración final...';
PRINT '--------------------------------------------';
SELECT
    threshold_key as 'Umbral',
    value as 'Valor',
    unit as 'Unidad',
    description as 'Descripción',
    updated_at as 'Última Actualización'
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
PRINT '✅ CONFIGURACIÓN COMPLETADA';
PRINT '============================================================================';
PRINT '';
PRINT '📋 VALORES CONFIGURADOS:';
PRINT '';

DECLARE @crit_low DECIMAL(18,4), @warn_low DECIMAL(18,4);
DECLARE @warn_high DECIMAL(18,4), @crit_high DECIMAL(18,4);

SELECT @crit_low = value FROM threshold_configs WHERE threshold_key = 'critical_voltage_low';
SELECT @warn_low = value FROM threshold_configs WHERE threshold_key = 'warning_voltage_low';
SELECT @warn_high = value FROM threshold_configs WHERE threshold_key = 'warning_voltage_high';
SELECT @crit_high = value FROM threshold_configs WHERE threshold_key = 'critical_voltage_high';

PRINT '   🔴 CRÍTICO:';
PRINT '      Voltaje <= ' + CAST(@crit_low AS VARCHAR) + 'V  (Crítico Bajo)';
PRINT '      Voltaje >= ' + CAST(@crit_high AS VARCHAR) + 'V  (Crítico Alto)';
PRINT '';
PRINT '   🟡 ADVERTENCIA:';
PRINT '      Voltaje <= ' + CAST(@warn_low AS VARCHAR) + 'V  (Advertencia Bajo)';
PRINT '      Voltaje >= ' + CAST(@warn_high AS VARCHAR) + 'V  (Advertencia Alto)';
PRINT '';
PRINT '   🟢 NORMAL:';
PRINT '      ' + CAST(@warn_low AS VARCHAR) + 'V < Voltaje < ' + CAST(@warn_high AS VARCHAR) + 'V';
PRINT '';
PRINT '============================================================================';
PRINT '📋 PRÓXIMOS PASOS:';
PRINT '   1. Reiniciar el servidor Node.js (si está corriendo)';
PRINT '   2. El servidor cargará automáticamente los nuevos umbrales';
PRINT '   3. Verifica los logs del servidor para confirmar:';
PRINT '      "✅ Umbrales de voltaje encontrados en BD"';
PRINT '   4. Las alertas se generarán automáticamente cada 30 segundos';
PRINT '';
PRINT '⚠️  Si necesitas cambiar los valores:';
PRINT '   - Edita este script y vuelve a ejecutarlo, O';
PRINT '   - Usa la interfaz web de gestión de umbrales, O';
PRINT '   - Ejecuta UPDATE manualmente en la base de datos';
PRINT '';
PRINT '============================================================================';
GO
