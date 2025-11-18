# Database Migrations

Este directorio contiene las migraciones de la base de datos SQL Server para el sistema de monitoreo de energía.

## Migraciones Disponibles

### 00000000000000_complete_database_setup.sql
Script de configuración inicial completa de la base de datos. Incluye:
- Creación de base de datos
- Todas las tablas del sistema
- Configuración de umbrales
- Sistema de usuarios con roles
- Datos iniciales

### 20250118000000_add_dual_pdu_support.sql
Migración para añadir soporte de dos PDUs por rack en el sistema de mantenimiento.

**Cambios incluidos:**
- Añade campos `pdu1_id` y `pdu1_serial` para la primera PDU
- Añade campos `pdu2_id` y `pdu2_serial` para la segunda PDU
- Migra datos existentes de `pdu_id` a `pdu1_id`
- Migra datos existentes de `serial` a `pdu1_serial`
- Crea índices para mejorar el rendimiento
- Mantiene compatibilidad con campos legacy

## Cómo Ejecutar las Migraciones

### Opción 1: SQL Server Management Studio (SSMS)

1. Abre SQL Server Management Studio
2. Conecta a tu servidor SQL Server
3. Abre el archivo de migración que deseas ejecutar
4. Ejecuta el script completo (F5)
5. Revisa los mensajes de salida para confirmar que se ejecutó correctamente

### Opción 2: sqlcmd (Línea de comandos)

```bash
# Para Windows
sqlcmd -S localhost -U sa -P YourPassword -i "supabase/migrations/20250118000000_add_dual_pdu_support.sql"

# Para conectarse a una instancia específica
sqlcmd -S localhost\SQLEXPRESS -U sa -P YourPassword -i "supabase/migrations/20250118000000_add_dual_pdu_support.sql"
```

### Opción 3: Azure Data Studio

1. Abre Azure Data Studio
2. Conecta a tu servidor SQL Server
3. Abre el archivo de migración
4. Haz clic en "Run" o presiona F5
5. Verifica los resultados en el panel de salida

## Verificar que la Migración se Ejecutó Correctamente

Después de ejecutar la migración `20250118000000_add_dual_pdu_support.sql`, puedes verificar que se aplicó correctamente ejecutando:

```sql
USE energy_monitor_db;

-- Verificar que las nuevas columnas existen
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'maintenance_rack_details'
AND COLUMN_NAME IN ('pdu1_id', 'pdu1_serial', 'pdu2_id', 'pdu2_serial');

-- Verificar que los índices se crearon
SELECT
    name as IndexName,
    type_desc as IndexType
FROM sys.indexes
WHERE object_id = OBJECT_ID('maintenance_rack_details')
AND name IN ('IX_maintenance_rack_details_pdu1_id', 'IX_maintenance_rack_details_pdu2_id');

-- Ver estadísticas de datos migrados
SELECT
    COUNT(*) as TotalRecords,
    COUNT(pdu1_id) as RecordsWithPDU1,
    COUNT(pdu2_id) as RecordsWithPDU2
FROM maintenance_rack_details;
```

## Orden de Ejecución

Si estás configurando la base de datos desde cero, ejecuta las migraciones en este orden:

1. `00000000000000_complete_database_setup.sql` - Configuración inicial
2. `20250118000000_add_dual_pdu_support.sql` - Soporte para dos PDUs

## Rollback

Si necesitas revertir la migración de PDU dual, puedes ejecutar:

```sql
USE energy_monitor_db;

-- Eliminar índices
DROP INDEX IF EXISTS IX_maintenance_rack_details_pdu1_id ON maintenance_rack_details;
DROP INDEX IF EXISTS IX_maintenance_rack_details_pdu2_id ON maintenance_rack_details;

-- Eliminar columnas
ALTER TABLE maintenance_rack_details DROP COLUMN IF EXISTS pdu1_id;
ALTER TABLE maintenance_rack_details DROP COLUMN IF EXISTS pdu1_serial;
ALTER TABLE maintenance_rack_details DROP COLUMN IF EXISTS pdu2_id;
ALTER TABLE maintenance_rack_details DROP COLUMN IF EXISTS pdu2_serial;
```

## Notas Importantes

- **Backups**: Siempre crea un backup de tu base de datos antes de ejecutar migraciones
- **Ambiente de prueba**: Ejecuta primero en un ambiente de desarrollo/testing
- **Compatibilidad**: Las migraciones están diseñadas para ser idempotentes (se pueden ejecutar múltiples veces sin causar errores)
- **Datos existentes**: Los datos existentes se migran automáticamente, no se pierden datos
