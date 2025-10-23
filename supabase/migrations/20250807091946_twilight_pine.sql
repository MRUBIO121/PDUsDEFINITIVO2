/*
  # Create threshold_configs table for SQL Server

  1. Table Structure
    - `id` (UNIQUEIDENTIFIER, primary key)
    - `threshold_key` (NVARCHAR, unique key identifier)
    - `value` (DECIMAL, threshold value)
    - `unit` (NVARCHAR, optional unit)
    - `description` (NVARCHAR, optional description)
    - `created_at` (DATETIME, creation timestamp)
    - `updated_at` (DATETIME, last update timestamp)

  2. Initial Data
    - Default threshold values for energy monitoring

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

-- Insert default threshold values
MERGE threshold_configs AS target
USING (VALUES 
    ('critical_voltage_low', 200.0, 'V', 'Critical low voltage threshold'),
    ('critical_voltage_high', 250.0, 'V', 'Critical high voltage threshold'),
    ('critical_temperature_high', 40.0, 'C', 'Critical high temperature threshold'),
    ('critical_power_high', 5000.0, 'W', 'Critical high power threshold'),
    ('warning_voltage_low', 210.0, 'V', 'Warning low voltage threshold'),
    ('warning_voltage_high', 240.0, 'V', 'Warning high voltage threshold'),
    ('warning_temperature_high', 30.0, 'C', 'Warning high temperature threshold'),
    ('warning_power_high', 4000.0, 'W', 'Warning high power threshold')
) AS source (threshold_key, value, unit, description)
ON target.threshold_key = source.threshold_key
WHEN NOT MATCHED THEN 
    INSERT (threshold_key, value, unit, description) 
    VALUES (source.threshold_key, source.value, source.unit, source.description);