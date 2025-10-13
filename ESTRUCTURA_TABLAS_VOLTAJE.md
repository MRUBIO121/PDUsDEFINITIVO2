# Estructura de Tablas del Sistema con Soporte de Voltaje

## Diagrama de Tablas

```
┌─────────────────────────────────────────────────────────────────────┐
│                          energy_monitor_db                          │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐
│    threshold_configs         │  ← Umbrales Globales
├──────────────────────────────┤
│ id (PK)                      │
│ threshold_key (UNIQUE)       │  ← 'critical_voltage_low', 'critical_voltage_high', etc.
│ value                        │  ← 200.0, 250.0, etc.
│ unit                         │  ← 'V', 'A', 'C', '%'
│ description                  │
│ created_at                   │
│ updated_at                   │
└──────────────────────────────┘
           │
           │ (referenciado por threshold_key)
           │
           ↓
┌──────────────────────────────┐
│ rack_threshold_overrides     │  ← Umbrales Específicos por Rack
├──────────────────────────────┤
│ id (PK)                      │
│ rack_id                      │  ← Identifica el rack
│ threshold_key                │  ← Mismo formato que threshold_configs
│ value                        │  ← Valor override para este rack
│ unit                         │
│ description                  │
│ created_at                   │
│ updated_at                   │
│ UNIQUE(rack_id, threshold_key)│
└──────────────────────────────┘


┌────────────────────────────────────────────────────────────────────┐
│           active_critical_alerts                                   │  ← Alertas Activas (incluye voltaje)
├────────────────────────────────────────────────────────────────────┤
│ id (PK)                                                            │
│ pdu_id                                                             │
│ rack_id                                                            │
│ name, country, site, dc, phase, chain, node, serial               │
│ alert_type                   ← 'critical'                          │
│ metric_type                  ← 'voltage' | 'amperage' | 'temperature' | 'humidity' │
│ alert_reason                 ← 'critical_voltage_low' | 'critical_voltage_high' │
│ alert_value                  ← Valor actual (ej: 255.5 V)         │
│ alert_field                  ← 'voltage'                           │
│ threshold_exceeded           ← Umbral excedido (ej: 250.0 V)      │
│ alert_started_at                                                   │
│ last_updated_at                                                    │
│ UNIQUE(pdu_id, metric_type, alert_reason)                         │
└────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────┐      ┌──────────────────────────────┐
│    maintenance_entries       │      │  maintenance_rack_details     │
├──────────────────────────────┤      ├──────────────────────────────┤
│ id (PK)                      │◄────┤│ id (PK)                      │
│ entry_type                   │      │ maintenance_entry_id (FK)    │
│ rack_id                      │      │ rack_id                      │  ← Si está aquí, NO evalúa voltaje
│ chain                        │      │ pdu_id, name, country, site  │
│ site, dc                     │      │ dc, phase, chain, node       │
│ reason                       │      │ serial, created_at           │
│ started_at, started_by       │      │ UNIQUE(entry_id, rack_id)    │
│ created_at                   │      └──────────────────────────────┘
└──────────────────────────────┘
```

---

## Tabla 1: threshold_configs

### Propósito
Almacena los umbrales globales que se aplican a TODOS los racks por defecto.

### Umbrales de Voltaje
```sql
threshold_key               | value  | unit | description
--------------------------- | ------ | ---- | -------------------------------------------
critical_voltage_low        | 200.0  | V    | Voltaje crítico mínimo - Mal funcionamiento
warning_voltage_low         | 210.0  | V    | Voltaje advertencia mínimo - Fuera de rango
warning_voltage_high        | 240.0  | V    | Voltaje advertencia máximo - Fuera de rango
critical_voltage_high       | 250.0  | V    | Voltaje crítico máximo - Riesgo de daño
```

### Ejemplo de Query
```sql
-- Ver todos los umbrales de voltaje
SELECT * FROM threshold_configs WHERE threshold_key LIKE '%voltage%';

-- Actualizar umbral crítico alto
UPDATE threshold_configs
SET value = 255.0, updated_at = GETDATE()
WHERE threshold_key = 'critical_voltage_high';
```

---

## Tabla 2: rack_threshold_overrides

### Propósito
Permite configurar umbrales específicos para racks individuales que necesitan límites diferentes.

### Ejemplo de Uso
```sql
-- Rack sensible: requiere voltaje más estable
INSERT INTO rack_threshold_overrides (rack_id, threshold_key, value, unit, description)
VALUES
  ('R-SENSIBLE-001', 'warning_voltage_low', 215.0, 'V', 'Equipos sensibles - umbral estricto'),
  ('R-SENSIBLE-001', 'warning_voltage_high', 235.0, 'V', 'Equipos sensibles - umbral estricto');

-- Ver overrides de un rack
SELECT * FROM rack_threshold_overrides WHERE rack_id = 'R-SENSIBLE-001';
```

### Prioridad
1. **rack_threshold_overrides** (si existe) → Valor específico del rack
2. **threshold_configs** → Valor global por defecto

---

## Tabla 3: active_critical_alerts

### Propósito
Almacena SOLO las alertas que están activas EN ESTE MOMENTO. Es una tabla "en vivo".

### Lifecycle de una Alerta de Voltaje
```
1. INSERT → Cuando voltage excede umbral crítico
2. UPDATE → Cada ciclo que la alerta persiste (actualiza last_updated_at)
3. DELETE → Cuando voltage vuelve a rango normal
```

### Ejemplo de Alertas de Voltaje
```sql
pdu_id  | rack_id | metric_type | alert_reason         | alert_value | threshold_exceeded | alert_started_at
--------|---------|-------------|----------------------|-------------|--------------------|------------------
PDU-001 | R-001   | voltage     | critical_voltage_high| 255.5       | 250.0              | 2025-10-13 14:23:15
PDU-042 | R-042   | voltage     | critical_voltage_low | 195.0       | 200.0              | 2025-10-13 14:25:30
```

### Queries Útiles
```sql
-- Ver todas las alertas de voltaje activas
SELECT
  pdu_id,
  rack_id,
  name,
  site,
  dc,
  alert_reason,
  alert_value AS voltaje_actual,
  threshold_exceeded AS umbral_excedido,
  alert_started_at,
  DATEDIFF(MINUTE, alert_started_at, GETDATE()) AS minutos_activa
FROM active_critical_alerts
WHERE metric_type = 'voltage'
ORDER BY alert_started_at DESC;

-- Contar alertas de voltaje por tipo
SELECT
  alert_reason,
  COUNT(*) AS cantidad
FROM active_critical_alerts
WHERE metric_type = 'voltage'
GROUP BY alert_reason;

-- Racks con más alertas de voltaje
SELECT
  rack_id,
  name,
  site,
  dc,
  COUNT(*) AS num_alertas
FROM active_critical_alerts
WHERE metric_type = 'voltage'
GROUP BY rack_id, name, site, dc
ORDER BY num_alertas DESC;
```

---

## Tabla 4 y 5: Sistema de Mantenimiento

### maintenance_entries
Agrupa racks en mantenimiento (individual o por chain completa).

### maintenance_rack_details
Lista específica de cada rack en mantenimiento.

### Comportamiento con Voltaje
```
Si rack_id está en maintenance_rack_details:
  → Backend NO evalúa umbrales de voltaje
  → Backend NO inserta/actualiza alertas
  → Frontend muestra indicador "En Mantenimiento"
  → Status = 'normal' (sin alertas)
```

### Ejemplo
```sql
-- Ver racks en mantenimiento
SELECT
  me.dc,
  me.reason,
  me.started_at,
  mrd.rack_id,
  mrd.name
FROM maintenance_entries me
JOIN maintenance_rack_details mrd ON me.id = mrd.maintenance_entry_id
WHERE me.dc = 'DC-MADRID';
```

---

## Flujo de Evaluación de Voltaje

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. API NENG /power endpoint                                     │
│    → totalVolts: 225.5                                          │
└────────────────────────────────┬────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Backend (server.cjs:1034)                                    │
│    voltage: parseFloat(powerItem.totalVolts) || 0               │
└────────────────────────────────┬────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Check Mantenimiento                                          │
│    ¿rack_id en maintenance_rack_details?                        │
│    SI → status = 'normal', reasons = []                         │
│    NO → continuar evaluación ↓                                  │
└────────────────────────────────┬────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Cargar Umbrales (server.cjs:374-408)                        │
│    A) Buscar en rack_threshold_overrides(rack_id)               │
│    B) Si no existe, usar threshold_configs                      │
│    Resultado: effectiveThresholds[]                             │
└────────────────────────────────┬────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Evaluar Voltaje (server.cjs:531-564)                        │
│    voltage = 225.5 V                                            │
│    critical_low = 200.0 V                                       │
│    warning_low = 210.0 V                                        │
│    warning_high = 240.0 V                                       │
│    critical_high = 250.0 V                                      │
│                                                                 │
│    ¿voltage <= 200 o >= 250?  → status = 'critical'            │
│    ¿voltage <= 210 o >= 240?  → status = 'warning'             │
│    Caso actual (225.5): status = 'normal' ✓                    │
└────────────────────────────────┬────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Si status = 'critical':                                      │
│    → Insertar/Actualizar active_critical_alerts                 │
│    → metric_type = 'voltage'                                    │
│    → alert_reason = 'critical_voltage_high'                     │
│    → alert_value = 225.5                                        │
│    → threshold_exceeded = 250.0                                 │
└────────────────────────────────┬────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. Frontend recibe datos                                        │
│    → RackCard muestra voltaje                                   │
│    → Si critical: tarjeta roja con alerta                       │
│    → Si warning: tarjeta amarilla                               │
│    → Si normal: tarjeta verde                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Índices Importantes

### active_critical_alerts
```sql
IX_active_critical_alerts_metric_type     -- Filtrar por tipo (voltage, amperage, etc.)
IX_active_critical_alerts_pdu_id          -- Buscar alertas de un PDU específico
IX_active_critical_alerts_site            -- Filtrar por sitio
IX_active_critical_alerts_dc              -- Filtrar por datacenter
IX_active_critical_alerts_alert_started_at -- Ordenar por antigüedad
```

### rack_threshold_overrides
```sql
IX_rack_threshold_overrides_rack_id       -- Buscar overrides de un rack
IX_rack_threshold_overrides_threshold_key -- Buscar racks con override específico
```

---

## Queries de Mantenimiento

### Ver Estado del Sistema
```sql
-- Resumen general
SELECT
  'Umbrales Voltaje' AS tipo,
  COUNT(*) AS cantidad
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%'
UNION ALL
SELECT
  'Overrides Voltaje',
  COUNT(*)
FROM rack_threshold_overrides
WHERE threshold_key LIKE '%voltage%'
UNION ALL
SELECT
  'Alertas Voltaje Activas',
  COUNT(*)
FROM active_critical_alerts
WHERE metric_type = 'voltage';
```

### Limpiar Alertas Antiguas (si es necesario)
```sql
-- Ver alertas sin actualizar por más de 1 hora
SELECT * FROM active_critical_alerts
WHERE DATEDIFF(MINUTE, last_updated_at, GETDATE()) > 60;

-- Eliminar alertas obsoletas (cuidado!)
DELETE FROM active_critical_alerts
WHERE DATEDIFF(MINUTE, last_updated_at, GETDATE()) > 60;
```

### Backup de Configuración
```sql
-- Exportar umbrales actuales
SELECT
  threshold_key,
  value,
  unit,
  description
FROM threshold_configs
WHERE threshold_key LIKE '%voltage%'
ORDER BY threshold_key;

-- Exportar overrides
SELECT
  rack_id,
  threshold_key,
  value,
  unit,
  description
FROM rack_threshold_overrides
WHERE threshold_key LIKE '%voltage%'
ORDER BY rack_id, threshold_key;
```

---

## Resumen de Campos de Voltaje

| Tabla | Campo | Propósito | Ejemplo |
|-------|-------|-----------|---------|
| threshold_configs | threshold_key | Identificador único del umbral | 'critical_voltage_high' |
| threshold_configs | value | Valor del umbral en voltios | 250.0 |
| rack_threshold_overrides | rack_id | Identifica el rack | 'R-042' |
| rack_threshold_overrides | threshold_key | Umbral a sobrescribir | 'critical_voltage_high' |
| rack_threshold_overrides | value | Nuevo valor para este rack | 260.0 |
| active_critical_alerts | metric_type | Tipo de métrica | 'voltage' |
| active_critical_alerts | alert_field | Campo que causó alerta | 'voltage' |
| active_critical_alerts | alert_reason | Razón específica | 'critical_voltage_high' |
| active_critical_alerts | alert_value | Valor actual medido | 255.5 |
| active_critical_alerts | threshold_exceeded | Umbral que se excedió | 250.0 |

---

**✅ Con estas tablas configuradas, el sistema tiene soporte completo para monitorear y alertar sobre problemas de voltaje en todos los PDUs.**
