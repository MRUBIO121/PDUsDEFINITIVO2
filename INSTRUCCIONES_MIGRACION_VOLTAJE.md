# Instrucciones para Configurar Base de Datos con Soporte de Voltaje

## Resumen

Este documento explica cómo configurar tu base de datos SQL Server para que el sistema de monitoreo de energía soporte completamente la métrica de **voltaje (totalVolts)**.

## Estado Actual

### Backend ✅ LISTO
- El backend **YA lee** el campo `totalVolts` del API NENG (ver `server.cjs` línea 1034)
- El backend **YA evalúa** los umbrales de voltaje (ver `server.cjs` líneas 531-564)
- El backend **YA inserta/actualiza** alertas de voltaje en la base de datos

### Base de Datos ⚠️ REQUIERE CONFIGURACIÓN
- Necesitas ejecutar migraciones SQL para crear/actualizar las tablas
- Las tablas deben tener soporte para almacenar umbrales y alertas de voltaje

---

## Opción 1: Setup Completo (Base de Datos Nueva o Desde Cero)

Si tu base de datos está vacía o quieres empezar desde cero, ejecuta **SOLO ESTE ARCHIVO**:

```sql
complete_database_setup_with_voltage.sql
```

Este archivo:
- ✅ Crea la base de datos `energy_monitor_db`
- ✅ Crea TODAS las tablas necesarias
- ✅ Inserta todos los umbrales (incluidos los 4 umbrales de voltaje)
- ✅ Configura índices y constraints
- ✅ Incluye soporte completo para voltaje desde el inicio

**Ventajas:**
- Un solo archivo, todo configurado
- Setup completo y verificado
- Incluye documentación detallada

---

## Opción 2: Migraciones Incrementales (Base de Datos Existente)

Si ya tienes una base de datos con datos y quieres mantenerla, ejecuta las migraciones en este orden:

### Paso 1: Setup Base (si no está creado)
```sql
supabase/migrations/20250930145215_fragrant_temple.sql
```
Crea:
- Base de datos `energy_monitor_db`
- Tabla `threshold_configs` con umbrales básicos (temperatura, humedad, amperaje)
- Tabla `rack_threshold_overrides`
- Tabla `active_critical_alerts`

### Paso 2: Alertas Avanzadas (si no está creada)
```sql
supabase/migrations/20250930120148_shrill_smoke.sql
```
Crea:
- Tabla `active_critical_alerts` con campos `metric_type`, `alert_field`, `alert_reason`
- Índices para búsquedas eficientes

### Paso 3: Sistema de Mantenimiento (si no está creado)
```sql
supabase/migrations/20251001120000_maintenance_mode.sql
```
Crea:
- Tabla `maintenance_racks` (versión anterior)

### Paso 4: Sistema de Mantenimiento Mejorado
```sql
supabase/migrations/20251006140000_improved_maintenance_system.sql
```
Crea:
- Tabla `maintenance_entries`
- Tabla `maintenance_rack_details`
- Migra datos de `maintenance_racks` si existe

### Paso 5: **SOPORTE DE VOLTAJE** ⚡ (NUEVO)
```sql
supabase/migrations/20251013140000_add_voltage_support.sql
```
Añade:
- ✅ 4 umbrales de voltaje en `threshold_configs`
- ✅ Verificación de soporte en `active_critical_alerts`
- ✅ Verificación de soporte en `rack_threshold_overrides`
- ✅ Documentación completa del flujo de voltaje

---

## Umbrales de Voltaje Configurados

El sistema configura estos umbrales para sistemas de **220V** (estándar en España):

| Threshold Key              | Valor | Unidad | Descripción                                      |
|----------------------------|-------|--------|--------------------------------------------------|
| `critical_voltage_low`     | 200.0 | V      | Voltaje crítico mínimo - Mal funcionamiento     |
| `warning_voltage_low`      | 210.0 | V      | Voltaje advertencia mínimo - Fuera de rango     |
| `warning_voltage_high`     | 240.0 | V      | Voltaje advertencia máximo - Fuera de rango     |
| `critical_voltage_high`    | 250.0 | V      | Voltaje crítico máximo - Riesgo de daño         |

### Ajustar para Otros Sistemas Eléctricos

**Para sistemas de 110V:**
```sql
UPDATE threshold_configs SET value = 95.0  WHERE threshold_key = 'critical_voltage_low';
UPDATE threshold_configs SET value = 105.0 WHERE threshold_key = 'warning_voltage_low';
UPDATE threshold_configs SET value = 120.0 WHERE threshold_key = 'warning_voltage_high';
UPDATE threshold_configs SET value = 125.0 WHERE threshold_key = 'critical_voltage_high';
```

**Para sistemas de 380V (trifásico):**
```sql
UPDATE threshold_configs SET value = 350.0 WHERE threshold_key = 'critical_voltage_low';
UPDATE threshold_configs SET value = 370.0 WHERE threshold_key = 'warning_voltage_low';
UPDATE threshold_configs SET value = 410.0 WHERE threshold_key = 'warning_voltage_high';
UPDATE threshold_configs SET value = 420.0 WHERE threshold_key = 'critical_voltage_high';
```

---

## Flujo Completo de Voltaje

```
API NENG
  └─ Endpoint: /power
     └─ Campo: totalVolts (valor en voltios)
        │
        ↓
Backend (server.cjs)
  └─ Línea 1034: voltage: parseFloat(powerItem.totalVolts) || 0
     └─ Líneas 531-564: Evaluación de umbrales
        │
        ↓
Base de Datos (SQL Server)
  └─ Tabla: active_critical_alerts
     ├─ metric_type: 'voltage'
     ├─ alert_field: 'voltage'
     ├─ alert_reason: 'critical_voltage_low' o 'critical_voltage_high'
     ├─ alert_value: Valor actual de voltaje
     └─ threshold_exceeded: Umbral que se excedió
        │
        ↓
Frontend (React)
  └─ Visualización de alertas de voltaje en tarjetas de racks
```

---

## Verificar que Todo Funciona

### 1. Verificar Umbrales en Base de Datos
```sql
SELECT * FROM threshold_configs WHERE threshold_key LIKE '%voltage%';
```

**Resultado esperado:** 4 filas con los umbrales de voltaje

### 2. Verificar Estructura de Tabla de Alertas
```sql
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'active_critical_alerts'
AND COLUMN_NAME IN ('metric_type', 'alert_field', 'alert_reason');
```

**Resultado esperado:** 3 filas mostrando estas columnas

### 3. Probar Inserción de Alerta de Voltaje (Simulación)
```sql
-- NO ejecutar en producción - solo prueba
INSERT INTO active_critical_alerts
  (pdu_id, rack_id, name, site, dc, phase, metric_type, alert_reason, alert_value, alert_field, threshold_exceeded)
VALUES
  ('TEST_PDU_001', 'TEST_RACK_001', 'Rack Prueba', 'Madrid', 'DC1', 'Single Phase',
   'voltage', 'critical_voltage_high', 255.5, 'voltage', 250.0);

-- Verificar inserción
SELECT * FROM active_critical_alerts WHERE pdu_id = 'TEST_PDU_001';

-- Limpiar prueba
DELETE FROM active_critical_alerts WHERE pdu_id = 'TEST_PDU_001';
```

### 4. Ver Alertas de Voltaje Activas (Producción)
```sql
SELECT
  pdu_id,
  rack_id,
  name,
  site,
  dc,
  alert_reason,
  alert_value AS 'Voltaje Actual',
  threshold_exceeded AS 'Umbral Excedido',
  alert_started_at AS 'Inicio Alerta'
FROM active_critical_alerts
WHERE metric_type = 'voltage'
ORDER BY alert_started_at DESC;
```

---

## Personalización de Umbrales por Rack

Si necesitas umbrales específicos para ciertos racks (por ejemplo, equipos más sensibles):

```sql
-- Ejemplo: Rack sensible requiere voltaje más estable (215-235V)
INSERT INTO rack_threshold_overrides (rack_id, threshold_key, value, unit, description)
VALUES
  ('RACK_SENSIBLE_001', 'warning_voltage_low', 215.0, 'V', 'Rack con equipos sensibles - umbral más estricto'),
  ('RACK_SENSIBLE_001', 'warning_voltage_high', 235.0, 'V', 'Rack con equipos sensibles - umbral más estricto');

-- Ejemplo: Rack de alta capacidad tolera más variación
INSERT INTO rack_threshold_overrides (rack_id, threshold_key, value, unit, description)
VALUES
  ('RACK_INDUSTRIAL_001', 'critical_voltage_low', 190.0, 'V', 'Rack industrial - tolera más variación'),
  ('RACK_INDUSTRIAL_001', 'critical_voltage_high', 260.0, 'V', 'Rack industrial - tolera más variación');
```

---

## Racks en Mantenimiento

Los racks en mantenimiento **NO generan alertas de voltaje** (ni de ninguna otra métrica).

El backend automáticamente excluye racks en mantenimiento de la evaluación de umbrales.

```sql
-- Ver racks actualmente en mantenimiento
SELECT
  me.entry_type,
  me.dc,
  me.reason,
  me.started_at,
  mrd.rack_id,
  mrd.name
FROM maintenance_entries me
JOIN maintenance_rack_details mrd ON me.id = mrd.maintenance_entry_id
ORDER BY me.started_at DESC;
```

---

## Recomendaciones

### 1. **Monitoreo Continuo**
- Revisa las alertas de voltaje regularmente
- Voltaje fuera de rango puede indicar problemas en UPS o instalación eléctrica

### 2. **Ajuste de Umbrales**
- Los valores por defecto son para sistemas de 220V
- Ajusta según las especificaciones de tu instalación
- Consulta con tu equipo eléctrico para valores óptimos

### 3. **Alertas Persistentes**
- Si un rack tiene alertas de voltaje constantes, investiga:
  - Problemas en el UPS
  - Sobrecarga en el circuito
  - Cableado defectuoso
  - Problemas en la red eléctrica

### 4. **Umbrales por Rack**
- Usa `rack_threshold_overrides` para equipos especiales
- Equipos sensibles: umbrales más estrictos
- Equipos industriales: umbrales más tolerantes

---

## Soporte

Si encuentras problemas o tienes preguntas:

1. Verifica que ejecutaste las migraciones en orden
2. Confirma que el backend está conectado a la base de datos correcta
3. Revisa los logs del backend para errores de inserción
4. Verifica variables de entorno (SQL_SERVER_HOST, SQL_SERVER_DATABASE, etc.)

---

## Resumen de Archivos Importantes

| Archivo | Propósito |
|---------|-----------|
| `complete_database_setup_with_voltage.sql` | Setup completo desde cero con voltaje |
| `supabase/migrations/20251013140000_add_voltage_support.sql` | Añadir voltaje a BD existente |
| `server.cjs` | Backend que lee totalVolts y evalúa umbrales |
| `src/types/index.ts` | Definición de tipo RackData con campo voltage |

---

**✅ Una vez ejecutadas las migraciones correctas, el sistema estará completamente configurado para monitorear voltaje en todos los PDUs.**
