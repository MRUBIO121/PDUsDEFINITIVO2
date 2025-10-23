/*
  # Create active_critical_alerts table for real-time critical alerts management

  1. New Table Structure
    - `id` (UNIQUEIDENTIFIER, primary key)
    - `pdu_id` (NVARCHAR, PDU identifier)
    - `rack_id` (NVARCHAR, rack/logical rack identifier)
    - `name` (NVARCHAR, rack/PDU name)
    - `country` (NVARCHAR, country location)
    - `site` (NVARCHAR, site location)
    - `dc` (NVARCHAR, datacenter location)
    - `phase` (NVARCHAR, electrical phase type)
    - `chain` (NVARCHAR, chain identifier)
    - `node` (NVARCHAR, node identifier)  
    - `serial` (NVARCHAR, serial number)
    - `alert_type` (NVARCHAR, tipo de alerta: critical, warning)
    - `metric_type` (NVARCHAR, tipo de métrica: amperage, temperature, humidity)
    - `alert_reason` (NVARCHAR, razón específica de la alerta)
    - `alert_value` (DECIMAL, valor que causó la alerta)
    - `alert_field` (NVARCHAR, campo que causó la alerta: current, temperature, sensorTemperature, sensorHumidity)
    - `threshold_exceeded` (DECIMAL, umbral que se excedió)
    - `alert_started_at` (DATETIME, cuándo comenzó la alerta)
    - `last_updated_at` (DATETIME, última actualización)

  2. Constraints and Indexes
    - Primary key on `id`
    - Unique constraint on (`pdu_id`, `metric_type`) to prevent duplicate metric alerts per PDU
    - Index on `pdu_id` for fast lookups
    - Index on `alert_started_at` for chronological queries
    - Index on `metric_type` for filtering by alert type

  3. Purpose
    - Stores only ACTIVE critical alerts
    - Records are inserted when critical alerts are detected
    - Records are deleted when alerts are resolved (PDU no longer critical)
    - Provides real-time view of current critical alerts in the system
    - Tracks specific metric that caused the alert and threshold exceeded

  4. Lifecycle
    - INSERT: When PDU becomes critical for a specific metric
    - UPDATE: When critical alert persists (update last_updated_at)
    - DELETE: When PDU no longer has critical alert for that metric
*/

-- Create the active_critical_alerts table
CREATE TABLE dbo.active_critical_alerts (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    pdu_id NVARCHAR(255) NOT NULL,
    rack_id NVARCHAR(255),
    name NVARCHAR(500),
    country NVARCHAR(255),
    site NVARCHAR(255),
    dc NVARCHAR(255),
    phase NVARCHAR(100),
    chain NVARCHAR(255),
    node NVARCHAR(255),
    serial NVARCHAR(255),
    alert_type NVARCHAR(50) NOT NULL DEFAULT 'critical',
    metric_type NVARCHAR(50) NOT NULL, -- amperage, temperature, humidity
    alert_reason NVARCHAR(255) NOT NULL, -- e.g., critical_amperage_high_single_phase
    alert_value DECIMAL(18, 4), -- actual value that caused the alert
    alert_field NVARCHAR(100), -- field name: current, temperature, sensorTemperature, sensorHumidity
    threshold_exceeded DECIMAL(18, 4), -- threshold value that was exceeded
    alert_started_at DATETIME DEFAULT GETDATE(),
    last_updated_at DATETIME DEFAULT GETDATE(),
    
    -- Unique constraint to prevent duplicate metric alerts per PDU
    CONSTRAINT UK_active_critical_alerts_pdu_metric UNIQUE (pdu_id, metric_type, alert_reason)
);

-- Create indexes for performance
CREATE INDEX IX_active_critical_alerts_pdu_id ON dbo.active_critical_alerts(pdu_id);
CREATE INDEX IX_active_critical_alerts_alert_started_at ON dbo.active_critical_alerts(alert_started_at);
CREATE INDEX IX_active_critical_alerts_metric_type ON dbo.active_critical_alerts(metric_type);
CREATE INDEX IX_active_critical_alerts_alert_type ON dbo.active_critical_alerts(alert_type);
CREATE INDEX IX_active_critical_alerts_site ON dbo.active_critical_alerts(site);
CREATE INDEX IX_active_critical_alerts_dc ON dbo.active_critical_alerts(dc);
CREATE INDEX IX_active_critical_alerts_last_updated ON dbo.active_critical_alerts(last_updated_at);