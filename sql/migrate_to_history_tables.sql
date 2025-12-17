/*
  Script de migracion unica: Copiar datos actuales a tablas de historico
  Microsoft SQL Server - Windows Server 2019

  Este script copia:
  - Alertas activas a alerts_history
  - Mantenimientos activos a maintenance_history

  EJECUTAR SOLO UNA VEZ despues de crear las tablas de historico
*/

PRINT 'Iniciando migracion a tablas de historico...';
PRINT '';

-- ============================================
-- Copiar alertas activas a alerts_history
-- ============================================

PRINT 'Copiando alertas activas a alerts_history...';

INSERT INTO alerts_history (
    pdu_id,
    rack_id,
    name,
    country,
    site,
    dc,
    phase,
    chain,
    node,
    serial,
    metric_type,
    alert_reason,
    alert_value,
    alert_field,
    threshold_exceeded,
    created_at,
    resolved_at,
    resolved_by,
    resolution_type,
    duration_minutes
)
SELECT
    pdu_id,
    rack_id,
    name,
    country,
    site,
    dc,
    phase,
    chain,
    node,
    serial,
    metric_type,
    alert_reason,
    alert_value,
    alert_field,
    threshold_exceeded,
    created_at,
    NULL,
    NULL,
    NULL,
    NULL
FROM active_critical_alerts;

DECLARE @alertCount INT = @@ROWCOUNT;
PRINT CONCAT('  - Alertas copiadas: ', @alertCount);
PRINT '';


-- ============================================
-- Copiar mantenimientos activos a maintenance_history
-- ============================================

PRINT 'Copiando mantenimientos activos a maintenance_history...';

INSERT INTO maintenance_history (
    original_entry_id,
    entry_type,
    rack_id,
    rack_name,
    country,
    site,
    dc,
    phase,
    chain,
    node,
    gwName,
    gwIp,
    reason,
    started_by,
    ended_by,
    started_at,
    ended_at,
    duration_minutes
)
SELECT
    me.id,
    me.entry_type,
    mrd.rack_id,
    mrd.name,
    mrd.country,
    mrd.site,
    mrd.dc,
    mrd.phase,
    mrd.chain,
    mrd.node,
    mrd.gwName,
    mrd.gwIp,
    me.reason,
    me.started_by,
    NULL,
    me.started_at,
    NULL,
    NULL
FROM maintenance_entries me
JOIN maintenance_rack_details mrd ON me.id = mrd.maintenance_entry_id;

DECLARE @maintenanceCount INT = @@ROWCOUNT;
PRINT CONCAT('  - Registros de mantenimiento copiados: ', @maintenanceCount);
PRINT '';


-- ============================================
-- Resumen
-- ============================================

PRINT '============================================';
PRINT 'Migracion completada:';
PRINT CONCAT('  - Alertas: ', @alertCount);
PRINT CONCAT('  - Mantenimientos: ', @maintenanceCount);
PRINT '';
PRINT 'Los registros se han copiado SIN fecha de resolucion/finalizacion';
PRINT 'ya que aun estan activos.';
PRINT '============================================';
GO
