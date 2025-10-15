# Solución: Alertas de Voltaje No Funcionan

## Problema Identificado

Las alertas de voltaje no se activan aunque los PDUs superen los umbrales porque **los umbrales de voltaje en la base de datos están en 0.0 o no existen**.

El código tiene esta validación de seguridad:
```javascript
// Solo evalúa si todos los umbrales están definidos y NO son cero
if (voltageCriticalLow > 0 && voltageCriticalHigh > 0 &&
    voltageWarningLow > 0 && voltageWarningHigh > 0) {
  // Evaluar alertas...
}
```

## Solución

### Paso 1: Ejecutar el Script SQL

Ejecuta el archivo `update_voltage_thresholds.sql` en tu servidor SQL Server:

```bash
sqlcmd -S TU_SERVIDOR -d energy_monitor_db -i update_voltage_thresholds.sql
```

O abre el archivo en **SQL Server Management Studio** y ejecútalo.

Este script configurará los umbrales de voltaje a:
- **Critical Low**: 200V (voltaje por debajo = CRÍTICO)
- **Warning Low**: 210V (voltaje por debajo = ADVERTENCIA)
- **Warning High**: 240V (voltaje por encima = ADVERTENCIA)
- **Critical High**: 250V (voltaje por encima = CRÍTICO)

### Paso 2: Reiniciar el Servidor

```bash
npm run server
```

### Paso 3: Verificar los Logs

Cuando el servidor inicie y procese datos, verás logs claros que muestran:

#### 1. Umbrales Cargados desde la Base de Datos
```
🔌 Umbrales de voltaje cargados desde BD:
   critical_voltage_low: 200V
   critical_voltage_high: 250V
   warning_voltage_low: 210V
   warning_voltage_high: 240V
```

Si NO ves este log, verás:
```
⚠️  NO SE ENCONTRARON UMBRALES DE VOLTAJE EN LA BASE DE DATOS
   Por favor ejecuta: update_voltage_thresholds.sql
```

#### 2. Debug de los Primeros 3 Racks
```
🔌 [Voltage Debug #1] Rack: RACK-001 (ID: 12345)
   Current Voltage: 185V
   Thresholds:
     Critical: 200V - 250V
     Warning:  210V - 240V
   ❌ CRITICAL: Voltage 185V < 200V
```

#### 3. Resumen de Evaluación de Voltaje
```
═══════════════════════════════════════════════════════
🔌 RESUMEN DE EVALUACIÓN DE VOLTAJE
═══════════════════════════════════════════════════════
📊 Total PDUs: 150
📊 PDUs con voltaje: 150
✅ Voltaje normal: 140
❌ Crítico bajo (<200V): 5
⚠️  Advertencia alto (>240V): 5

📋 Muestra de PDUs con voltaje (primeros 3):
   1. RACK-001: 185V - Status: critical - Reasons: [critical_voltage_low]
   2. RACK-002: 225V - Status: normal - Reasons: []
   3. RACK-003: 245V - Status: warning - Reasons: [warning_voltage_high]
═══════════════════════════════════════════════════════
```

#### 4. PDUs con Problemas Sin Detectar
Si hay PDUs que **deberían** tener alertas pero no las tienen, verás:
```
⚠️  PDUs CON VOLTAJE FUERA DE RANGO PERO SIN ALERTA:
   1. RACK-004: 180V - Voltaje bajo (<200V)
      Status: normal, Reasons: []
   2. RACK-005: 260V - Voltaje alto (>250V)
      Status: normal, Reasons: []
```

## Verificación Rápida

Para verificar que los umbrales están en la base de datos:

```sql
USE energy_monitor_db;
GO

SELECT threshold_key, value, unit, description
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%'
ORDER BY threshold_key;
```

Deberías ver 4 registros con valores 200, 210, 240 y 250.

## Notas Importantes

1. **Los valores 0.0 se ignoran**: El código está diseñado para NO evaluar umbrales si están en 0, evitando falsas alarmas.

2. **Cache de umbrales**: Los umbrales se cachean por 5 minutos. Si actualizas los umbrales:
   - Reinicia el servidor, O
   - Espera 5 minutos para que expire el cache

3. **Valores recomendados**: Los valores configurados (200-250V) son apropiados para sistemas eléctricos europeos de 220V ±10%.

4. **Ajustar según tu infraestructura**: Si tu infraestructura usa diferentes voltajes, ajusta los valores desde la interfaz web en la sección de configuración de umbrales.

## Si Aún No Funciona

Si después de seguir estos pasos las alertas aún no funcionan:

1. Verifica los logs del servidor en detalle
2. Busca el mensaje "⚠️  PDUs CON VOLTAJE FUERA DE RANGO PERO SIN ALERTA"
3. Verifica que el campo `totalVolts` venga correcto desde la API NENG
4. Revisa si los racks están en modo mantenimiento (se ignoran alertas)
