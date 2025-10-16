# Configuración de Umbrales de Voltaje

## Resumen de Cambios

Se ha configurado el sistema para que los umbrales de voltaje se lean **ÚNICAMENTE** de la base de datos SQL Server, sin valores por defecto hardcodeados.

## Flujo de Datos

### 1. Origen de Datos de Voltaje
- **API NENG**: Los datos de voltaje se obtienen del campo `totalVolts` de la API NENG
- **Mapeo**: En `server.cjs` línea 1110: `voltage: parseFloat(powerItem.totalVolts) || 0`

### 2. Origen de Umbrales
- **Base de Datos**: SQL Server tabla `threshold_configs`
- **NO hay valores por defecto**: El sistema ahora consulta SOLO la base de datos
- **Auto-inserción**: Si los umbrales de voltaje no existen, se insertan automáticamente con valores iniciales:
  - `critical_voltage_low`: 200V
  - `critical_voltage_high`: 250V
  - `warning_voltage_low`: 210V
  - `warning_voltage_high`: 240V

### 3. Evaluación de Alertas

El sistema compara el voltaje de cada PDU con los umbrales de la base de datos:

```
Voltaje <= 200V          → CRÍTICO BAJO (critical_voltage_low)
200V < Voltaje <= 210V   → WARNING BAJO (warning_voltage_low)
210V < Voltaje < 240V    → NORMAL
240V <= Voltaje < 250V   → WARNING ALTO (warning_voltage_high)
Voltaje >= 250V          → CRÍTICO ALTO (critical_voltage_high)
```

## Cambios Técnicos Realizados

### 1. Operadores de Comparación (líneas 609-638)
✅ Cambiado de `<` y `>` a `<=` y `>=` para consistencia con otros umbrales

### 2. Función `getThresholdFromReason` (líneas 895-937)
✅ Eliminados valores hardcodeados
✅ Ahora consulta los umbrales reales de la base de datos

### 3. Función `extractMetricInfo` (líneas 850-893)
✅ Ahora recibe y usa los umbrales de la base de datos

### 4. Función `fetchThresholdsFromDatabase` (líneas 286-338)
✅ Verifica existencia de umbrales de voltaje
✅ Inserta automáticamente si faltan
✅ Logs detallados de verificación

### 5. Logs de Depuración (líneas 597-607)
✅ Muestra claramente que los umbrales vienen de SQL Server
✅ Identifica el origen del voltaje (NENG API totalVolts)

## Verificación

Al iniciar el servidor, verás estos logs:

```
✅ Umbrales de voltaje encontrados en BD SQL Server:
   critical_voltage_low: 200V
   critical_voltage_high: 250V
   warning_voltage_low: 210V
   warning_voltage_high: 240V

🔌 [Voltage Debug #1] Rack: RACK_NAME (ID: PDU_ID)
   Current Voltage: 220V (from NENG API totalVolts field)
   Thresholds (from SQL Server database):
     Critical Low:  200V (key: critical_voltage_low)
     Warning Low:   210V (key: warning_voltage_low)
     Warning High:  240V (key: warning_voltage_high)
     Critical High: 250V (key: critical_voltage_high)
```

## Interfaz de Usuario

Cuando un PDU supera los umbrales de voltaje:
- **CRÍTICO**: Fondo rojo en la métrica de voltaje
- **WARNING**: Fondo amarillo en la métrica de voltaje
- **NORMAL**: Fondo blanco

El comportamiento es idéntico al de temperatura, humedad y amperaje.

## Gestión de Umbrales

Para modificar los umbrales de voltaje:

1. **A través de la UI**: Usar el gestor de umbrales en la aplicación
2. **Directamente en SQL Server**:
   ```sql
   UPDATE threshold_configs
   SET value = 205.0
   WHERE threshold_key = 'critical_voltage_low'
   ```

Los cambios se aplicarán automáticamente tras el TTL del cache (5 minutos) o al reiniciar el servidor.
