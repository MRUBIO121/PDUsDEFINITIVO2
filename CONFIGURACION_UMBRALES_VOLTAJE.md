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

⚠️ **IMPORTANTE**: Los umbrales de voltaje NO tienen valores por defecto en la base de datos.

Debes configurarlos manualmente según:
- Especificaciones técnicas de tus equipos
- Estándares eléctricos de tu región
- Requisitos operacionales específicos

| Umbral | Estado Inicial | Descripción |
|--------|---------------|-------------|
| `critical_voltage_low` | NULL/Vacío | Voltaje crítico mínimo - Riesgo de mal funcionamiento |
| `warning_voltage_low` | NULL/Vacío | Voltaje advertencia mínimo - Fuera del rango nominal |
| `warning_voltage_high` | NULL/Vacío | Voltaje advertencia máximo - Fuera del rango nominal |
| `critical_voltage_high` | NULL/Vacío | Voltaje crítico máximo - Riesgo de daño a equipos |

### Ejemplos de Valores según Región:

**Europa (230V sistema):**
- Critical Low: 200V
- Warning Low: 210V
- Warning High: 240V
- Critical High: 250V

**América (120V sistema):**
- Critical Low: 100V
- Warning Low: 105V
- Warning High: 125V
- Critical High: 130V

**Asia (220V sistema):**
- Critical Low: 190V
- Warning Low: 200V
- Warning High: 235V
- Critical High: 245V

## Lógica de Evaluación

El servidor evalúa el voltaje de cada PDU siguiendo esta lógica:

1. **Obtiene el voltaje** del campo `totalVolts` de la API NENG
2. **Lee los umbrales** desde la tabla `threshold_configs` de la base de datos
3. **Compara el voltaje** con los umbrales:
   - Si voltage <= critical_voltage_low → `critical_voltage_low`
   - Si voltage >= critical_voltage_high → `critical_voltage_high`
   - Si voltage <= warning_voltage_low → `warning_voltage_low`
   - Si voltage >= warning_voltage_high → `warning_voltage_high`
   - De lo contrario → Normal

⚠️ **NOTA**: Si los umbrales están en NULL o son 0, NO se evaluará el voltaje y NO se generarán alertas.

## Verificación

Los logs del servidor muestran:
- Umbrales cargados desde la base de datos
- Evaluación de voltaje de los primeros 3 PDUs (debug)
- Resumen estadístico con contadores de alertas

Ejemplo de log cuando los umbrales NO están configurados:
```
═══════════════════════════════════════════════════════
🔌 RESUMEN DE EVALUACIÓN DE VOLTAJE
═══════════════════════════════════════════════════════
📊 Umbrales desde Base de Datos:
   - Critical Low:  N/A
   - Warning Low:   N/A
   - Warning High:  N/A
   - Critical High: N/A

📊 Total PDUs: 150
📊 PDUs con voltaje: 145
✅ Voltaje normal: 145
⚠️  Umbrales no configurados - No se generan alertas
═══════════════════════════════════════════════════════
```

Ejemplo de log cuando los umbrales SÍ están configurados:
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

## Configuración Inicial de Umbrales

### Paso 1: Resetear valores a NULL (si existen valores antiguos)

Ejecuta el script SQL proporcionado:
```bash
# En SQL Server
sqlcmd -S localhost -d energy_monitor_db -i update_voltage_thresholds_empty.sql
```

### Paso 2: Configurar los umbrales

**Opción 1: Desde la aplicación web**
1. Acceder a la aplicación
2. Ir a la sección de "Gestión de Umbrales"
3. Configurar los 4 valores de voltaje según tus necesidades
4. Guardar cambios

**Opción 2: Directamente en la base de datos**
```sql
-- Ejemplo para sistema 230V (Europa)
UPDATE threshold_configs
SET value = 200.0, updated_at = GETDATE()
WHERE threshold_key = 'critical_voltage_low';

UPDATE threshold_configs
SET value = 210.0, updated_at = GETDATE()
WHERE threshold_key = 'warning_voltage_low';

UPDATE threshold_configs
SET value = 240.0, updated_at = GETDATE()
WHERE threshold_key = 'warning_voltage_high';

UPDATE threshold_configs
SET value = 250.0, updated_at = GETDATE()
WHERE threshold_key = 'critical_voltage_high';
```

### Paso 3: Verificar

Los cambios se aplican automáticamente en la próxima actualización de datos (cada 30 segundos).

Verifica en los logs del servidor:
```
📊 Umbrales desde Base de Datos:
   - Critical Low:  200V  ✅
   - Warning Low:   210V  ✅
   - Warning High:  240V  ✅
   - Critical High: 250V  ✅
```

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
