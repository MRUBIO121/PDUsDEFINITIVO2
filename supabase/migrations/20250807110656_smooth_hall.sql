/*
  # Initial threshold configuration for energy monitoring system

  1. Table Structure
    - `id` (UNIQUEIDENTIFIER, primary key)
    - `threshold_key` (NVARCHAR, unique key identifier)
    - `value` (DECIMAL, threshold value)
    - `unit` (NVARCHAR, optional unit)
    - `description` (NVARCHAR, optional description)
    - `created_at` (DATETIME, creation timestamp)
    - `updated_at` (DATETIME, last update timestamp)

  2. Initial Thresholds
    - Temperature thresholds (critical/warning, low/high)
    - Humidity thresholds (critical/warning, low/high)
    - Amperage thresholds by phase:
      - Single Phase (critical/warning, low/high)
      - 3-Phase (critical/warning, low/high)

  3. Security
    - Primary key constraint
    - Unique constraint on threshold_key
*/

-- Create the threshold_configs table
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
END;

-- Insert initial threshold values
MERGE threshold_configs AS target
USING (VALUES 
    -- Temperature thresholds
    ('critical_temperature_low', 5.0, 'C', 'Critical low temperature threshold'),
    ('critical_temperature_high', 40.0, 'C', 'Critical high temperature threshold'),
    ('warning_temperature_low', 10.0, 'C', 'Warning low temperature threshold'),
    ('warning_temperature_high', 30.0, 'C', 'Warning high temperature threshold'),
    
    -- Humidity thresholds
    ('critical_humidity_low', 20.0, '%', 'Critical low humidity threshold'),
    ('critical_humidity_high', 80.0, '%', 'Critical high humidity threshold'),
    ('warning_humidity_low', 30.0, '%', 'Warning low humidity threshold'),
    ('warning_humidity_high', 70.0, '%', 'Warning high humidity threshold'),
    
    -- Amperage thresholds - Single Phase
    ('critical_amperage_low_single_phase', 1.0, 'A', 'Critical low amperage threshold for Single Phase'),
    ('critical_amperage_high_single_phase', 25.0, 'A', 'Critical high amperage threshold for Single Phase'),
    ('warning_amperage_low_single_phase', 2.0, 'A', 'Warning low amperage threshold for Single Phase'),
    ('warning_amperage_high_single_phase', 20.0, 'A', 'Warning high amperage threshold for Single Phase'),
    
    -- Amperage thresholds - 3-Phase
    ('critical_amperage_low_3_phase', 1.0, 'A', 'Critical low amperage threshold for 3-Phase'),
    ('critical_amperage_high_3_phase', 30.0, 'A', 'Critical high amperage threshold for 3-Phase'),
    ('warning_amperage_low_3_phase', 2.0, 'A', 'Warning low amperage threshold for 3-Phase'),
    ('warning_amperage_high_3_phase', 25.0, 'A', 'Warning high amperage threshold for 3-Phase')
) AS source (threshold_key, value, unit, description)
ON target.threshold_key = source.threshold_key
WHEN MATCHED THEN 
    UPDATE SET value = source.value, unit = source.unit, description = source.description, updated_at = GETDATE()
WHEN NOT MATCHED THEN 
    INSERT (threshold_key, value, unit, description) 
    VALUES (source.threshold_key, source.value, source.unit, source.description);