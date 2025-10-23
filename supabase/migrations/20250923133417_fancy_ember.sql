/*
  # Create alerts table for critical alerts management - Amperage Only

  1. Table Structure
    - `id` (UNIQUEIDENTIFIER, primary key)
    - `pdu_id` (NVARCHAR, PDU identifier)
    - `logical_rack_id` (NVARCHAR, logical rack identifier)
    - `name` (NVARCHAR, rack/PDU name)
    - `country` (NVARCHAR, country location)
    - `site` (NVARCHAR, site location)
    - `dc` (NVARCHAR, datacenter location)
    - `phase` (NVARCHAR, electrical phase type)
    - `chain` (NVARCHAR, chain identifier)
    - `node` (NVARCHAR, node identifier)
    - `serial` (NVARCHAR, serial number)
    - `current` (DECIMAL, current/amperage reading) - ONLY electrical metric
    - `temperature` (DECIMAL, temperature reading)
    - `sensor_temperature` (DECIMAL, sensor temperature reading)
    - `sensor_humidity` (DECIMAL, sensor humidity reading)
    - `reasons` (NVARCHAR, JSON array of alert reasons)
    - `alert_started_at` (DATETIME, when alert first occurred)
    - `last_updated_at` (DATETIME, last update timestamp)

  2. Indexes
    - Index on pdu_id for fast lookups
    - Index on alert_started_at for chronological queries

  3. Security
    - Primary key constraint
    - Unique constraint on pdu_id to prevent duplicates

  Note: This table only stores current/amperage data, not voltage or power
*/

-- Drop existing alerts table if it exists
IF EXISTS (SELECT * FROM sysobjects WHERE name='alerts' AND xtype='U')
BEGIN
    DROP TABLE dbo.alerts;
END;

-- Create the alerts table with amperage only
CREATE TABLE dbo.alerts (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    pdu_id NVARCHAR(255) UNIQUE NOT NULL,
    logical_rack_id NVARCHAR(255),
    name NVARCHAR(500),
    country NVARCHAR(255),
    site NVARCHAR(255),
    dc NVARCHAR(255),
    phase NVARCHAR(100),
    chain NVARCHAR(255),
    node NVARCHAR(255),
    serial NVARCHAR(255),
    current DECIMAL(18, 4), -- Only electrical metric we store
    temperature DECIMAL(18, 4),
    sensor_temperature DECIMAL(18, 4),
    sensor_humidity DECIMAL(18, 4),
    reasons NVARCHAR(MAX), -- JSON array of alert reasons
    alert_started_at DATETIME DEFAULT GETDATE(),
    last_updated_at DATETIME DEFAULT GETDATE()
);

-- Create indexes for performance
CREATE INDEX IX_alerts_pdu_id ON dbo.alerts(pdu_id);
CREATE INDEX IX_alerts_alert_started_at ON dbo.alerts(alert_started_at);
CREATE INDEX IX_alerts_site ON dbo.alerts(site);
CREATE INDEX IX_alerts_country ON dbo.alerts(country);
CREATE INDEX IX_alerts_dc ON dbo.alerts(dc);
CREATE INDEX IX_alerts_last_updated ON dbo.alerts(last_updated_at);