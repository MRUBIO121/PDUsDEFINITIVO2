-- Script para añadir el campo 'group' a las tablas de alertas
-- Este campo almacena el grupo de destino basado en el site:
-- - GTH_IN_ES_DCaaS_DC_H&E_Cantabria (si site contiene 'cantabria')
-- - GTH_IN_ES_DCaaS_DC_H&E_Boadilla (si site contiene 'boadilla')

-- Añadir campo 'group' a la tabla active_critical_alerts
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'active_critical_alerts'
    AND COLUMN_NAME = 'group'
)
BEGIN
    ALTER TABLE dbo.active_critical_alerts
    ADD [group] NVARCHAR(100) NULL;
    PRINT 'Campo [group] añadido a dbo.active_critical_alerts';
END
ELSE
BEGIN
    PRINT 'Campo [group] ya existe en dbo.active_critical_alerts';
END
GO

-- Añadir campo 'group' a la tabla alerts_history
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'alerts_history'
    AND COLUMN_NAME = 'group'
)
BEGIN
    ALTER TABLE dbo.alerts_history
    ADD [group] NVARCHAR(100) NULL;
    PRINT 'Campo [group] añadido a dbo.alerts_history';
END
ELSE
BEGIN
    PRINT 'Campo [group] ya existe en dbo.alerts_history';
END
GO

-- Actualizar registros existentes basándose en el campo site
UPDATE dbo.active_critical_alerts
SET [group] = CASE
    WHEN LOWER(site) LIKE '%cantabria%' THEN 'GTH_IN_ES_DCaaS_DC_H&E_Cantabria'
    WHEN LOWER(site) LIKE '%boadilla%' THEN 'GTH_IN_ES_DCaaS_DC_H&E_Boadilla'
    ELSE ''
END
WHERE [group] IS NULL;
PRINT 'Registros existentes actualizados en dbo.active_critical_alerts';
GO

UPDATE dbo.alerts_history
SET [group] = CASE
    WHEN LOWER(site) LIKE '%cantabria%' THEN 'GTH_IN_ES_DCaaS_DC_H&E_Cantabria'
    WHEN LOWER(site) LIKE '%boadilla%' THEN 'GTH_IN_ES_DCaaS_DC_H&E_Boadilla'
    ELSE ''
END
WHERE [group] IS NULL;
PRINT 'Registros existentes actualizados en dbo.alerts_history';
GO
