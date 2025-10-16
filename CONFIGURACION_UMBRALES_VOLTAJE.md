# Configuración de Umbrales de Voltaje

## Resumen de Cambios

La aplicación ahora lee **EXCLUSIVAMENTE** los umbrales de voltaje desde la base de datos y compara estos valores con los datos de energía/power de la API NENG para generar alertas.

## Cambios Realizados

### 1. Eliminación de Valores Hardcodeados

**Antes:**
```javascript
function getThresholdFromReason(reason) {
  if (reason.includes('critical_voltage_high')) return 250.0;
  if (reason.includes('critical_voltage_low')) return 200.0;
  if (reason.includes('warning_voltage_high')) return 240.0;
  if (reason.includes('warning_voltage_low')) return 210.0;
  return null;
}
```

**Después:**
```javascript
function getThresholdFromReason(reason, thresholds) {
  // Busca el valor en los umbrales de la base de datos
  const threshold = thresholds.find(t => t.key === thresholdKey);
  return threshold ? threshold.value : null;
}
```

### 2. Umbrales desde Base de Datos

La función `getThresholdFromReason` ahora:
- Recibe los umbrales como parámetro
- Mapea cada tipo de alerta a su clave de umbral correspondiente
- Busca el valor en el array de umbrales de la base de datos
- Retorna `null` si no encuentra el umbral

### 3. Flujo de Datos de Voltaje

```
API NENG (campo totalVolts)
    ↓
Server (campo voltage)
    ↓
Umbrales de Base de Datos
    ↓
Evaluación de Alertas
    ↓
Frontend (visualización)
```

## Configuración Actual de Umbrales

Los umbrales de voltaje están configurados en la base de datos con estos valores (estándar europeo 220V ±10%):

| Umbral | Valor | Descripción |
|--------|-------|-------------|
| `critical_voltage_low` | 200V | Voltaje crítico mínimo - Riesgo de mal funcionamiento |
| `warning_voltage_low` | 210V | Voltaje advertencia mínimo - Fuera del rango nominal |
| `warning_voltage_high` | 240V | Voltaje advertencia máximo - Fuera del rango nominal |
| `critical_voltage_high` | 250V | Voltaje crítico máximo - Riesgo de daño a equipos |

## Lógica de Evaluación

El servidor evalúa el voltaje de cada PDU siguiendo esta lógica:

1. **Obtiene el voltaje** del campo `totalVolts` de la API NENG
2. **Lee los umbrales** desde la tabla `threshold_configs` de la base de datos
3. **Compara el voltaje** con los umbrales:
   - Si voltage <= critical_voltage_low (200V) → `critical_voltage_low`
   - Si voltage >= critical_voltage_high (250V) → `critical_voltage_high`
   - Si voltage <= warning_voltage_low (210V) → `warning_voltage_low`
   - Si voltage >= warning_voltage_high (240V) → `warning_voltage_high`
   - De lo contrario → Normal

## Verificación

Los logs del servidor muestran:
- Umbrales cargados desde la base de datos
- Evaluación de voltaje de los primeros 3 PDUs (debug)
- Resumen estadístico con contadores de alertas

Ejemplo de log:
```
═══════════════════════════════════════════════════════
🔌 RESUMEN DE EVALUACIÓN DE VOLTAJE
═══════════════════════════════════════════════════════
📊 Umbrales desde Base de Datos:
   - Critical Low:  200V
   - Warning Low:   210V
   - Warning High:  240V
   - Critical High: 250V

📊 Total PDUs: 150
📊 PDUs con voltaje: 145
✅ Voltaje normal: 140
❌ Crítico bajo (<=200V): 2
⚠️  Advertencia bajo (<=210V): 3
═══════════════════════════════════════════════════════
```

## Modificación de Umbrales

Para modificar los umbrales de voltaje:

1. **Opción 1: Desde la aplicación web**
   - Navegar a la sección de gestión de umbrales
   - Modificar los valores deseados
   - Guardar cambios

2. **Opción 2: Directamente en la base de datos**
   ```sql
   UPDATE threshold_configs
   SET value = 195.0
   WHERE threshold_key = 'critical_voltage_low';
   ```

3. **Los cambios se aplican automáticamente** en la próxima actualización de datos (cada 30 segundos)

## Archivos Modificados

- `server.cjs`:
  - Función `getThresholdFromReason()` - Ahora busca en la BD
  - Función `extractMetricInfo()` - Recibe y pasa umbrales
  - Función `processCriticalAlert()` - Actualizada para pasar umbrales
  - Resumen de voltaje - Muestra valores de la BD

## Notas Importantes

- ✅ **NO** hay valores hardcodeados de voltaje en el código
- ✅ **TODOS** los umbrales se leen de la base de datos
- ✅ Los cambios en la BD se reflejan automáticamente
- ✅ El sistema funciona sin reinicio del servidor
