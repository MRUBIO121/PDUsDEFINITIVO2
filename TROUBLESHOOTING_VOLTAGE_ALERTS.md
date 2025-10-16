# Troubleshooting: Alertas de Voltaje No se Generan

## Problema
Las alertas de voltaje no se marcan aunque el voltaje supere los umbrales configurados.

## Diagnóstico Paso a Paso

### PASO 1: Verificar que los umbrales existen en la Base de Datos

```sql
-- Ejecuta esta query en SQL Server
USE energy_monitor_db;
GO

SELECT
    threshold_key,
    value,
    unit,
    description
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%'
ORDER BY threshold_key;
```

**Resultado Esperado:**
```
threshold_key            value    unit    description
---------------------------------------------------------
critical_voltage_high    250.0    V       Voltaje crítico máximo...
critical_voltage_low     200.0    V       Voltaje crítico mínimo...
warning_voltage_high     240.0    V       Voltaje advertencia máximo...
warning_voltage_low      210.0    V       Voltaje advertencia mínimo...
```

**SI NO HAY RESULTADOS o los valores son NULL:**
```bash
# Ejecuta el script de configuración:
sqlcmd -S localhost -d energy_monitor_db -i configure_voltage_thresholds.sql
```

### PASO 2: Verificar los Logs del Servidor

Inicia/reinicia el servidor y busca en los logs:

**✅ CORRECTO - Umbrales encontrados:**
```
✅ Umbrales de voltaje encontrados en BD:
   critical_voltage_low: 200V
   warning_voltage_low: 210V
   warning_voltage_high: 240V
   critical_voltage_high: 250V
```

**❌ ERROR - No hay umbrales:**
```
❌ No se encontraron umbrales de voltaje en la base de datos
```

Si ves el error, ejecuta `configure_voltage_thresholds.sql` (PASO 1).

### PASO 3: Verificar que el API NENG está enviando datos de voltaje

Busca en los logs del servidor:

```
🔌 [Voltage Debug #1] Rack: PDU-001 (ID: abc123)
   Current Voltage: 220V
   Thresholds:
     Critical: 200V - 250V
     Warning:  210V - 240V
```

**SI el voltaje muestra 0V o N/A:**
- El problema está en la API NENG
- Verifica que el campo `totalVolts` tenga datos

**SI los umbrales muestran undefined o 0:**
- El problema está en la base de datos (vuelve al PASO 1)

### PASO 4: Verificar la Evaluación de Voltaje

En los logs del servidor, busca:

```
═══════════════════════════════════════════════════════
🔌 RESUMEN DE EVALUACIÓN DE VOLTAJE
═══════════════════════════════════════════════════════
📊 Umbrales desde Base de Datos:
   - Critical Low:  200V  ✅
   - Warning Low:   210V  ✅
   - Warning High:  240V  ✅
   - Critical High: 250V  ✅

📊 Total PDUs: 150
📊 PDUs con voltaje: 145
✅ Voltaje normal: 140
❌ Crítico bajo (<=200V): 2
⚠️  Advertencia bajo (<=210V): 3
═══════════════════════════════════════════════════════
```

**SI todos los valores son N/A:**
- Los umbrales NO están en la base de datos
- Ejecuta `configure_voltage_thresholds.sql`

**SI todos los PDUs muestran "Voltaje normal" pero deberían tener alertas:**
- Verifica que el voltaje real esté fuera del rango
- Los valores actuales deben ser <= 200V o >= 250V para crítico

### PASO 5: Verificar la Lógica de Evaluación

El código evalúa de esta manera:

```javascript
// Salta la evaluación si:
if (voltageCriticalLow === undefined || voltageCriticalHigh === undefined ||
    voltageWarningLow === undefined || voltageWarningHigh === undefined ||
    voltageCriticalLow <= 0 || voltageCriticalHigh <= 0 ||
    voltageWarningLow <= 0 || voltageWarningHigh <= 0) {
  // NO SE EVALÚA - Umbrales no configurados
}
```

Para que funcione, **TODOS** estos valores deben:
1. Estar definidos (no `undefined`)
2. Ser mayores a 0
3. Estar en la base de datos

## Solución Rápida

```bash
# 1. Configurar umbrales en la base de datos
sqlcmd -S localhost -d energy_monitor_db -i configure_voltage_thresholds.sql

# 2. Reiniciar el servidor Node.js
# (Ctrl+C para detener, luego reiniciar)

# 3. Esperar 30 segundos para la próxima actualización

# 4. Verificar en los logs:
# "✅ Umbrales de voltaje encontrados en BD"
```

## Checklist de Verificación

- [ ] Los umbrales existen en la tabla `threshold_configs`
- [ ] Los valores NO son NULL
- [ ] Los valores son > 0
- [ ] El servidor muestra "✅ Umbrales de voltaje encontrados en BD"
- [ ] El API NENG está enviando datos de voltaje (totalVolts)
- [ ] Los valores de voltaje son números válidos (no 0, no N/A)
- [ ] El servidor se reinició después de configurar los umbrales

## Valores de Referencia

### Sistema 230V (Europa)
- Critical Low: **200V** (alerta si voltaje ≤ 200V)
- Warning Low: **210V** (alerta si voltaje ≤ 210V)
- Warning High: **240V** (alerta si voltaje ≥ 240V)
- Critical High: **250V** (alerta si voltaje ≥ 250V)
- Normal: Entre 210V y 240V

### Sistema 120V (América)
- Critical Low: **100V**
- Warning Low: **105V**
- Warning High: **125V**
- Critical High: **130V**
- Normal: Entre 105V y 125V

## Comandos Útiles

```sql
-- Ver todos los umbrales
SELECT * FROM threshold_configs ORDER BY threshold_key;

-- Ver solo umbrales de voltaje
SELECT * FROM threshold_configs WHERE threshold_key LIKE '%voltage%';

-- Actualizar un umbral específico
UPDATE threshold_configs
SET value = 195.0, updated_at = GETDATE()
WHERE threshold_key = 'critical_voltage_low';

-- Verificar que NO haya valores NULL
SELECT threshold_key, value
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%' AND value IS NULL;
```

## Ejemplo de Voltaje con Alerta

Para probar, puedes configurar temporalmente umbrales muy amplios:

```sql
-- Configuración de prueba (generará muchas alertas)
UPDATE threshold_configs SET value = 100.0 WHERE threshold_key = 'critical_voltage_low';
UPDATE threshold_configs SET value = 150.0 WHERE threshold_key = 'warning_voltage_low';
UPDATE threshold_configs SET value = 230.0 WHERE threshold_key = 'warning_voltage_high';
UPDATE threshold_configs SET value = 280.0 WHERE threshold_key = 'critical_voltage_high';
```

Con esta configuración, voltajes entre 150V-230V serán normales, y fuera de ese rango generarán alertas.

## Contacto

Si después de seguir estos pasos el problema persiste:
1. Comparte los logs del servidor
2. Comparte el resultado de la query de umbrales
3. Indica qué valores de voltaje estás viendo en el frontend
