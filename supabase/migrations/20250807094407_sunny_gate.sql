/*
  # Create threshold_configs table for SQL Server with extended thresholds

  1. Table Structure
    - `id` (UNIQUEIDENTIFIER, primary key)
    - `threshold_key` (NVARCHAR, unique key identifier)
    - `value` (DECIMAL, threshold value)
    - `unit` (NVARCHAR, optional unit)
    - `description` (NVARCHAR, optional description)
    - `created_at` (DATETIME, creation timestamp)
    - `updated_at` (DATETIME, last update timestamp)

  2. Initial Data
    - Extended threshold values for energy monitoring including:
      - Voltage (low/high)
      - Temperature (low/high)
      - Power (high only)
      - Amperage/Current (low/high)
      - Humidity (low/high)
    - Both critical and warning levels for each parameter

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

-- Insert extended threshold values
MERGE threshold_configs AS target
USING (VALUES 
    -- Voltage thresholds
    ('critical_voltage_low', 200.0, 'V', 'Critical low voltage threshold'),
    ('critical_voltage_high', 250.0, 'V', 'Critical high voltage threshold'),
    ('warning_voltage_low', 210.0, 'V', 'Warning low voltage threshold'),
    ('warning_voltage_high', 240.0, 'V', 'Warning high voltage threshold'),
    
    -- Temperature thresholds
    ('critical_temperature_low', 5.0, 'C', 'Critical low temperature threshold'),
    ('critical_temperature_high', 40.0, 'C', 'Critical high temperature threshold'),
    ('warning_temperature_low', 10.0, 'C', 'Warning low temperature threshold'),
    ('warning_temperature_high', 30.0, 'C', 'Warning high temperature threshold'),
    
    -- Power thresholds
    ('critical_power_high', 5000.0, 'W', 'Critical high power threshold'),
    ('warning_power_high', 4000.0, 'W', 'Warning high power threshold'),
    
    -- Amperage/Current thresholds
    ('critical_amperage_low', 1.0, 'A', 'Critical low amperage threshold'),
    ('critical_amperage_high', 25.0, 'A', 'Critical high amperage threshold'),
    ('warning_amperage_low', 2.0, 'A', 'Warning low amperage threshold'),
    ('warning_amperage_high', 20.0, 'A', 'Warning high amperage threshold'),
    
    -- Humidity thresholds
    ('critical_humidity_low', 20.0, '%', 'Critical low humidity threshold'),
    ('critical_humidity_high', 80.0, '%', 'Critical high humidity threshold'),
    ('warning_humidity_low', 30.0, '%', 'Warning low humidity threshold'),
    ('warning_humidity_high', 70.0, '%', 'Warning high humidity threshold')
) AS source (threshold_key, value, unit, description)
ON target.threshold_key = source.threshold_key
WHEN NOT MATCHED THEN 
    INSERT (threshold_key, value, unit, description) 
    VALUES (source.threshold_key, source.value, source.unit, source.description);