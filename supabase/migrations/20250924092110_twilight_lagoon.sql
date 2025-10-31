/*
  # Añadir estado y fecha de resolución a la tabla de alertas

  1. Nuevas Columnas
    - `status` (NVARCHAR, estado de la alerta: critical, warning)
    - `resolved_at` (DATETIME, fecha de resolución - NULL si sigue activa)

  2. Modificaciones
    - Añade columna de estado para diferenciar entre critical y warning
    - Añade columna de resolución para marcar cuándo se resolvió la alerta
    - Las alertas NO se eliminan, solo se marcan como resueltas

  3. Índices
    - Índice en `status` para consultas rápidas por estado
    - Índice en `resolved_at` para consultas de alertas activas/resueltas
*/

-- Añadir columna de estado si no existe
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'alerts' AND COLUMN_NAME = 'status'
)
BEGIN
    ALTER TABLE dbo.alerts ADD status NVARCHAR(50) NOT NULL DEFAULT 'critical';
END;

-- Añadir columna de fecha de resolución si no existe
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'alerts' AND COLUMN_NAME = 'resolved_at'
)
BEGIN
    ALTER TABLE dbo.alerts ADD resolved_at DATETIME NULL;
END;

-- Crear índices para optimizar consultas
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_alerts_status' AND object_id = OBJECT_ID('dbo.alerts'))
BEGIN
    CREATE INDEX IX_alerts_status ON dbo.alerts(status);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_alerts_resolved_at' AND object_id = OBJECT_ID('dbo.alerts'))
BEGIN
    CREATE INDEX IX_alerts_resolved_at ON dbo.alerts(resolved_at);
END;

-- Índice compuesto para consultas de alertas activas por estado
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_alerts_status_resolved_at' AND object_id = OBJECT_ID('dbo.alerts'))
BEGIN
    CREATE INDEX IX_alerts_status_resolved_at ON dbo.alerts(status, resolved_at);
END;