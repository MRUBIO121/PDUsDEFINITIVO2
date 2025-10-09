# Explicación Detallada de Queries SQL - Sistema de Monitoreo de Energía con Voltaje

## Archivo: `complete_database_setup_with_voltage.sql`

Este documento explica en detalle cada query del archivo SQL y su propósito en el sistema.

---

## ÍNDICE

1. [Creación de Base de Datos](#1-creación-de-base-de-datos)
2. [Tabla: threshold_configs](#2-tabla-threshold_configs)
3. [Tabla: rack_threshold_overrides](#3-tabla-rack_threshold_overrides)
4. [Tabla: active_critical_alerts](#4-tabla-active_critical_alerts)
5. [Tabla: maintenance_entries](#5-tabla-maintenance_entries)
6. [Tabla: maintenance_rack_details](#6-tabla-maintenance_rack_details)
7. [Verificación Final](#7-verificación-final)

---

## 1. CREACIÓN DE BASE DE DATOS

### Query 1.1: Verificar y crear base de datos

```sql
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'energy_monitor_db')
BEGIN
    CREATE DATABASE energy_monitor_db;
    PRINT '✅ Base de datos energy_monitor_db creada';
END
```

**¿Qué hace?**
- Consulta el catálogo del sistema (`sys.databases`) para verificar si la base de datos existe
- Si NO existe, la crea con el nombre `energy_monitor_db`
- Si ya existe, no hace nada (evita errores)

**¿Por qué es importante?**
- Permite ejecutar el script múltiples veces sin errores
- Es idempotente (se puede ejecutar varias veces de forma segura)

### Query 1.2: Cambiar contexto a la base de datos

```sql
USE energy_monitor_db;
GO
```

**¿Qué hace?**
- Cambia el contexto de ejecución a la base de datos `energy_monitor_db`
- Todas las queries siguientes se ejecutarán en esta base de datos

**¿Por qué es importante?**
- Asegura que las tablas se creen en la base de datos correcta
- `GO` es un separador de lotes en SQL Server (no es SQL estándar)

---

## 2. TABLA: threshold_configs

### Query 2.1: Crear tabla threshold_configs

```sql
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='threshold_configs' AND xtype='U')
BEGIN
    CREATE TABLE threshold_configs (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        threshold_key NVARCHAR(255) UNIQUE NOT NULL,
        value DECIMAL(18, 4) NOT NULL,
        unit NVARCHAR(50),
        description NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
END
```

**¿Qué hace?**
- Verifica si la tabla existe usando `sysobjects` (catálogo de SQL Server)
- Si NO existe, crea la tabla con 7 columnas

**Columnas explicadas:**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UNIQUEIDENTIFIER | ID único auto-generado (GUID) - Llave primaria |
| `threshold_key` | NVARCHAR(255) | Clave única que identifica el tipo de umbral (ej: 'critical_voltage_low') |
| `value` | DECIMAL(18,4) | Valor numérico del umbral (hasta 18 dígitos, 4 decimales) |
| `unit` | NVARCHAR(50) | Unidad de medida ('V', 'A', 'C', '%', 'W') |
| `description` | NVARCHAR(MAX) | Descripción legible del umbral |
| `created_at` | DATETIME | Fecha de creación (auto-generada con GETDATE()) |
| `updated_at` | DATETIME | Fecha de última actualización (auto-generada con GETDATE()) |

**Constraints:**
- `PRIMARY KEY`: El campo `id` es la llave primaria (no puede haber duplicados)
- `UNIQUE`: El campo `threshold_key` debe ser único (no puede haber dos umbrales con la misma clave)
- `NOT NULL`: Los campos `threshold_key` y `value` son obligatorios

**¿Por qué DECIMAL(18,4)?**
- Permite almacenar valores muy grandes (hasta 999,999,999,999,999.9999)
- Mantiene 4 decimales de precisión (suficiente para voltios, amperios, etc.)
- Evita problemas de redondeo que tendrían los tipos FLOAT

### Query 2.2: Insertar umbrales por defecto

```sql
MERGE threshold_configs AS target
USING (VALUES
    ('critical_voltage_low', 200.0, 'V', 'Voltaje crítico mínimo - Riesgo de mal funcionamiento'),
    ('critical_voltage_high', 250.0, 'V', 'Voltaje crítico máximo - Riesgo de daño'),
    -- ... más valores ...
) AS source (threshold_key, value, unit, description)
ON target.threshold_key = source.threshold_key
WHEN MATCHED THEN
    UPDATE SET value = source.value, unit = source.unit, description = source.description, updated_at = GETDATE()
WHEN NOT MATCHED THEN
    INSERT (threshold_key, value, unit, description)
    VALUES (source.threshold_key, source.value, source.unit, source.description);
```

**¿Qué hace?**
- Usa `MERGE` (operación UPSERT: UPDATE + INSERT)
- Compara los valores fuente con los existentes en la tabla usando `threshold_key`
- Si el `threshold_key` YA EXISTE: actualiza los valores (MATCHED)
- Si el `threshold_key` NO EXISTE: inserta un nuevo registro (NOT MATCHED)

**¿Por qué MERGE en lugar de INSERT?**
- Es idempotente: se puede ejecutar múltiples veces sin crear duplicados
- Actualiza valores automáticamente si el script se ejecuta de nuevo
- Útil para migraciones y actualizaciones de umbrales

**Umbrales de Voltaje insertados:**

| threshold_key | value | unit | Descripción |
|---------------|-------|------|-------------|
| `critical_voltage_low` | 200.0 | V | Por debajo de 200V es crítico (mal funcionamiento) |
| `critical_voltage_high` | 250.0 | V | Por encima de 250V es crítico (puede dañar equipos) |
| `warning_voltage_low` | 210.0 | V | Entre 200-210V es advertencia |
| `warning_voltage_high` | 240.0 | V | Entre 240-250V es advertencia |

**Lógica de evaluación:**
```
CRÍTICO BAJO: voltage <= 200V
ADVERTENCIA BAJO: 200V < voltage <= 210V
NORMAL: 210V < voltage < 240V
ADVERTENCIA ALTO: 240V <= voltage < 250V
CRÍTICO ALTO: voltage >= 250V
```

---

## 3. TABLA: rack_threshold_overrides

### Query 3.1: Crear tabla rack_threshold_overrides

```sql
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='rack_threshold_overrides' AND xtype='U')
BEGIN
    CREATE TABLE rack_threshold_overrides (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        rack_id NVARCHAR(255) NOT NULL,
        threshold_key NVARCHAR(255) NOT NULL,
        value DECIMAL(18, 4) NOT NULL,
        unit NVARCHAR(50),
        description NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        CONSTRAINT UK_rack_threshold_overrides_rack_key UNIQUE (rack_id, threshold_key)
    );
END
```

**¿Qué hace?**
- Crea una tabla para almacenar umbrales específicos de racks individuales
- Permite sobrescribir los umbrales globales para racks específicos

**Diferencia con threshold_configs:**
- `threshold_configs`: Umbrales globales que aplican a TODOS los racks
- `rack_threshold_overrides`: Umbrales específicos que aplican a UN rack particular

**Constraint UNIQUE (rack_id, threshold_key):**
```sql
CONSTRAINT UK_rack_threshold_overrides_rack_key UNIQUE (rack_id, threshold_key)
```

**¿Qué significa?**
- Un rack NO puede tener dos overrides para el mismo threshold_key
- Por ejemplo: rack_001 solo puede tener UN override para 'critical_voltage_low'
- Evita inconsistencias en los datos

**Ejemplo de uso:**

```sql
-- Rack 001 tiene equipos sensibles, necesita voltaje más estable
INSERT INTO rack_threshold_overrides (rack_id, threshold_key, value, unit, description)
VALUES ('rack_001', 'critical_voltage_low', 210.0, 'V', 'Rack con equipos sensibles');

-- Rack 002 tiene equipos robustos, tolera más variación
INSERT INTO rack_threshold_overrides (rack_id, threshold_key, value, unit, description)
VALUES ('rack_002', 'critical_voltage_low', 190.0, 'V', 'Rack con equipos industriales');
```

**Lógica de prioridad en el backend:**
1. Buscar override específico del rack
2. Si existe, usar ese valor
3. Si NO existe, usar el umbral global de `threshold_configs`

### Query 3.2: Crear índices

```sql
CREATE INDEX IX_rack_threshold_overrides_rack_id ON rack_threshold_overrides(rack_id);
CREATE INDEX IX_rack_threshold_overrides_threshold_key ON rack_threshold_overrides(threshold_key);
CREATE INDEX IX_rack_threshold_overrides_created_at ON rack_threshold_overrides(created_at);
```

**¿Qué hace?**
- Crea índices (indexes) para acelerar las búsquedas

**Índices explicados:**

| Índice | Columna | Propósito |
|--------|---------|-----------|
| `IX_rack_threshold_overrides_rack_id` | rack_id | Búsquedas rápidas: "Dame todos los overrides del rack_001" |
| `IX_rack_threshold_overrides_threshold_key` | threshold_key | Búsquedas: "Qué racks tienen overrides de voltaje" |
| `IX_rack_threshold_overrides_created_at` | created_at | Ordenar por fecha: "Últimos overrides creados" |

**Impacto en performance:**
- **Sin índice**: SQL Server escanea toda la tabla (lento para tablas grandes)
- **Con índice**: SQL Server usa una estructura optimizada (mucho más rápido)

**Ejemplo de mejora:**
```
Sin índice: 1000ms para buscar overrides de un rack en tabla de 100,000 registros
Con índice: 5ms para la misma búsqueda
```

---

## 4. TABLA: active_critical_alerts

### Query 4.1: Crear tabla active_critical_alerts

```sql
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='active_critical_alerts' AND xtype='U')
BEGIN
    CREATE TABLE active_critical_alerts (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        pdu_id NVARCHAR(255) NOT NULL,
        rack_id NVARCHAR(255),
        -- ... campos de ubicación ...
        alert_type NVARCHAR(50) NOT NULL DEFAULT 'critical',
        metric_type NVARCHAR(50) NOT NULL,
        alert_reason NVARCHAR(255) NOT NULL,
        alert_value DECIMAL(18, 4),
        alert_field NVARCHAR(100),
        threshold_exceeded DECIMAL(18, 4),
        alert_started_at DATETIME DEFAULT GETDATE(),
        last_updated_at DATETIME DEFAULT GETDATE(),
        CONSTRAINT UK_active_critical_alerts_pdu_metric UNIQUE (pdu_id, metric_type, alert_reason)
    );
END
```

**¿Qué hace?**
- Crea una tabla para almacenar SOLO las alertas que están activas AHORA
- Es una "tabla en vivo" que refleja el estado actual del sistema

**Campos específicos para alertas de voltaje:**

| Campo | Valor para Voltaje | Ejemplo |
|-------|-------------------|---------|
| `metric_type` | 'voltage' | 'voltage' |
| `alert_field` | 'voltage' | 'voltage' |
| `alert_reason` | 'critical_voltage_low' o 'critical_voltage_high' | 'critical_voltage_low' |
| `alert_value` | Valor actual de voltaje | 195.5 |
| `threshold_exceeded` | Valor del umbral que se excedió | 200.0 |

**Constraint UNIQUE (pdu_id, metric_type, alert_reason):**

**¿Qué significa?**
- Un PDU NO puede tener dos alertas activas iguales simultáneamente
- Por ejemplo: PDU_001 solo puede tener UNA alerta de 'critical_voltage_low' activa

**¿Por qué es importante?**
- Evita duplicación de alertas
- Si una alerta persiste, se ACTUALIZA (UPDATE) en lugar de crear nueva

**Lifecycle de una alerta de voltaje:**

```
1. DETECCIÓN (en processRackData del backend):
   - Se lee voltaje del API NENG (totalVolts)
   - Se compara con umbrales
   - Si voltage <= 200V → genera alerta 'critical_voltage_low'

2. INSERT (primera vez que se detecta):
   INSERT INTO active_critical_alerts (
       pdu_id, metric_type, alert_reason,
       alert_value, threshold_exceeded, ...
   ) VALUES (
       'PDU_001', 'voltage', 'critical_voltage_low',
       195.5, 200.0, ...
   );

3. UPDATE (si la alerta persiste):
   UPDATE active_critical_alerts
   SET alert_value = 193.2,
       last_updated_at = GETDATE()
   WHERE pdu_id = 'PDU_001'
     AND metric_type = 'voltage'
     AND alert_reason = 'critical_voltage_low';

4. DELETE (cuando se resuelve):
   DELETE FROM active_critical_alerts
   WHERE pdu_id = 'PDU_001'
     AND metric_type = 'voltage'
     AND alert_reason = 'critical_voltage_low';
```

**Queries comunes en el frontend:**

```sql
-- Dashboard: Contar alertas de voltaje activas
SELECT COUNT(*) as total_voltage_alerts
FROM active_critical_alerts
WHERE metric_type = 'voltage';

-- Filtrar: Solo alertas de voltaje bajo
SELECT *
FROM active_critical_alerts
WHERE metric_type = 'voltage'
  AND alert_reason = 'critical_voltage_low';

-- Exportar: Todas las alertas activas ordenadas por sitio
SELECT site, dc, pdu_id, metric_type, alert_value, threshold_exceeded
FROM active_critical_alerts
ORDER BY site, dc, metric_type;
```

---

## 5. TABLA: maintenance_entries

### Query 5.1: Crear tabla maintenance_entries

```sql
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_entries' AND xtype='U')
BEGIN
    CREATE TABLE maintenance_entries (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        entry_type NVARCHAR(50) NOT NULL CHECK (entry_type IN ('individual_rack', 'chain')),
        rack_id NVARCHAR(255) NULL,
        chain NVARCHAR(255) NULL,
        site NVARCHAR(255) NULL,
        dc NVARCHAR(255) NOT NULL,
        reason NVARCHAR(MAX),
        started_at DATETIME DEFAULT GETDATE(),
        started_by NVARCHAR(255),
        created_at DATETIME DEFAULT GETDATE()
    );
END
```

**¿Qué hace?**
- Crea la tabla "padre" para el sistema de mantenimiento
- Cada registro representa una "sesión de mantenimiento"

**Campo entry_type con CHECK constraint:**

```sql
entry_type NVARCHAR(50) NOT NULL CHECK (entry_type IN ('individual_rack', 'chain'))
```

**¿Qué significa?**
- `entry_type` solo puede tener dos valores: 'individual_rack' o 'chain'
- SQL Server rechazará cualquier otro valor automáticamente

**Diferencia entre tipos:**

| entry_type | rack_id | chain | Descripción |
|------------|---------|-------|-------------|
| 'individual_rack' | Requerido | Opcional | Un rack específico en mantenimiento |
| 'chain' | NULL | Requerido | Toda una chain (múltiples racks) en mantenimiento |

**Ejemplo de uso:**

```sql
-- Poner un rack individual en mantenimiento
INSERT INTO maintenance_entries (entry_type, rack_id, dc, reason, started_by)
VALUES ('individual_rack', 'rack_001', 'DC_Madrid', 'Actualización de firmware', 'admin@example.com');

-- Poner una chain completa en mantenimiento
INSERT INTO maintenance_entries (entry_type, chain, site, dc, reason, started_by)
VALUES ('chain', 'Chain_5', 'Madrid', 'DC_Madrid', 'Mantenimiento preventivo mensual', 'ops@example.com');
```

**Impacto en evaluación de métricas (incluido voltaje):**

Cuando un rack está en mantenimiento:
```javascript
// En processRackData (backend)
if (isInMaintenance) {
    return {
        ...rack,
        status: 'normal',  // Forzar estado normal
        reasons: []        // Sin razones de alerta
    };
}
// NO se evalúa: amperaje, voltaje, temperatura, humedad
// NO se generan alertas
// NO se actualiza active_critical_alerts
```

---

## 6. TABLA: maintenance_rack_details

### Query 6.1: Crear tabla maintenance_rack_details

```sql
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_rack_details' AND xtype='U')
BEGIN
    CREATE TABLE maintenance_rack_details (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        maintenance_entry_id UNIQUEIDENTIFIER NOT NULL,
        rack_id NVARCHAR(255) NOT NULL,
        -- ... campos adicionales ...
        CONSTRAINT FK_maintenance_rack_details_entry
            FOREIGN KEY (maintenance_entry_id)
            REFERENCES maintenance_entries(id)
            ON DELETE CASCADE,
        CONSTRAINT UK_maintenance_rack_details_entry_rack
            UNIQUE (maintenance_entry_id, rack_id)
    );
END
```

**¿Qué hace?**
- Crea la tabla "hija" que contiene los detalles de cada rack en mantenimiento
- Relacionada con `maintenance_entries` mediante Foreign Key

**Foreign Key con CASCADE:**

```sql
CONSTRAINT FK_maintenance_rack_details_entry
    FOREIGN KEY (maintenance_entry_id)
    REFERENCES maintenance_entries(id)
    ON DELETE CASCADE
```

**¿Qué significa?**
- Cada registro en `maintenance_rack_details` DEBE tener un `maintenance_entry_id` válido
- Si se elimina una entrada en `maintenance_entries`, automáticamente se eliminan todos sus detalles
- `ON DELETE CASCADE`: Eliminación en cascada

**Ejemplo de CASCADE:**

```sql
-- Se crea una entrada de mantenimiento
INSERT INTO maintenance_entries (id, entry_type, chain, dc)
VALUES ('GUID-001', 'chain', 'Chain_5', 'DC_Madrid');

-- Se añaden 10 racks de esa chain a los detalles
INSERT INTO maintenance_rack_details (maintenance_entry_id, rack_id, ...)
VALUES ('GUID-001', 'rack_001', ...), -- 10 registros
       ('GUID-001', 'rack_002', ...),
       ...
       ('GUID-001', 'rack_010', ...);

-- Al eliminar la entrada principal
DELETE FROM maintenance_entries WHERE id = 'GUID-001';

-- Resultado: Los 10 registros en maintenance_rack_details SE ELIMINAN AUTOMÁTICAMENTE
```

**Constraint UNIQUE (maintenance_entry_id, rack_id):**

**¿Qué significa?**
- Un rack NO puede aparecer dos veces en la misma entrada de mantenimiento
- Evita duplicación de datos

**Relación con evaluación de voltaje:**

```sql
-- Query que ejecuta el backend para obtener racks en mantenimiento
SELECT DISTINCT rack_id
FROM maintenance_rack_details;

-- Retorna: ['rack_001', 'rack_002', 'rack_003']
-- Estos racks NO se evalúan para ninguna métrica (incluido voltaje)
```

---

## 7. VERIFICACIÓN FINAL

### Query 7.1: Resumen de tablas

```sql
SELECT
    'threshold_configs' as Tabla,
    COUNT(*) as Total_Registros,
    'Umbrales globales (incluye 4 umbrales de voltaje)' as Descripcion
FROM threshold_configs
UNION ALL
SELECT 'rack_threshold_overrides', COUNT(*), 'Umbrales específicos por rack'
FROM rack_threshold_overrides
-- ... más tablas ...
```

**¿Qué hace?**
- Cuenta los registros en cada tabla
- Muestra un resumen consolidado
- Útil para verificar que el script se ejecutó correctamente

**Resultado esperado:**

| Tabla | Total_Registros | Descripcion |
|-------|-----------------|-------------|
| threshold_configs | 20 | Umbrales globales (incluye 4 de voltaje) |
| rack_threshold_overrides | 0 | Umbrales específicos por rack |
| active_critical_alerts | 0 | Alertas críticas activas |
| maintenance_entries | 0 | Entradas de mantenimiento |
| maintenance_rack_details | 0 | Detalles de racks en mantenimiento |

---

## RESUMEN: Flujo Completo de Voltaje en el Sistema

### 1. Configuración Inicial (SQL)

```sql
-- 1.1 Se insertan umbrales de voltaje en threshold_configs
MERGE threshold_configs ...
VALUES ('critical_voltage_low', 200.0, 'V', ...);
```

### 2. Lectura de Datos (Backend - server.cjs)

```javascript
// 2.1 Se lee totalVolts del API NENG
const mapped = {
    voltage: parseFloat(powerItem.totalVolts) || 0,
    // ...
};
```

### 3. Evaluación de Umbrales (Backend - processRackData)

```javascript
// 3.1 Se obtienen umbrales (global o override específico del rack)
const voltageCriticalLow = getThresholdValue(effectiveThresholds, 'critical_voltage_low');

// 3.2 Se evalúa el voltaje
if (voltage <= voltageCriticalLow) {
    reasons.push('critical_voltage_low');
    status = 'critical';
}
```

### 4. Gestión de Alertas (Backend - manageActiveCriticalAlerts)

```javascript
// 4.1 Si el status es 'critical', se inserta/actualiza en active_critical_alerts
INSERT INTO active_critical_alerts (
    pdu_id, metric_type, alert_reason, alert_value, threshold_exceeded
) VALUES (
    'PDU_001', 'voltage', 'critical_voltage_low', 195.5, 200.0
);
```

### 5. Visualización (Frontend)

```typescript
// 5.1 Las tarjetas de rack muestran el voltaje
{rack.voltage != null && rack.voltage > 0 ? `${rack.voltage}V` : 'N/A'}

// 5.2 El fondo cambia según la alerta
className={`${getMetricBgColor(rack, 'voltage')} ...`}
// - bg-red-50: alerta crítica
// - bg-yellow-50: alerta de advertencia
// - bg-white: normal
```

### 6. Filtrado (Frontend)

```typescript
// 6.1 El usuario puede filtrar por alertas de voltaje
if (metricFilter === 'voltage') {
    filteredRacks = racks.filter(rack =>
        rack.reasons?.some(r => r.includes('voltage'))
    );
}
```

---

## CONCLUSIÓN

Este archivo SQL proporciona:

1. ✅ **5 tablas** completamente configuradas para el sistema
2. ✅ **4 umbrales de voltaje** insertados con valores por defecto apropiados
3. ✅ **Soporte completo** para alertas de voltaje en `active_critical_alerts`
4. ✅ **Overrides por rack** para casos especiales de voltaje
5. ✅ **Sistema de mantenimiento** que excluye evaluación de voltaje
6. ✅ **Índices** para optimizar performance en consultas de voltaje
7. ✅ **Idempotencia** - Se puede ejecutar múltiples veces sin errores

El sistema está listo para monitorear voltaje (totalVolts) en todos los PDUs del datacenter.
