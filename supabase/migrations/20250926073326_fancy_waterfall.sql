/*
  # Create rack_threshold_overrides table for rack-specific thresholds

  1. New Table Structure
    - `id` (UNIQUEIDENTIFIER, primary key)
    - `rack_id` (NVARCHAR, rack identifier - matches RackData.id from frontend)
    - `threshold_key` (NVARCHAR, threshold key identifier - matches threshold_configs.threshold_key)
    - `value` (DECIMAL, threshold value)
    - `unit` (NVARCHAR, optional unit)
    - `description` (NVARCHAR, optional description)
    - `created_at` (DATETIME, creation timestamp)
    - `updated_at` (DATETIME, last update timestamp)

  2. Constraints and Indexes
    - Primary key on `id`
    - Unique constraint on (`rack_id`, `threshold_key`) to prevent duplicates
    - Index on `rack_id` for fast lookups by rack
    - Index on `threshold_key` for fast lookups by threshold type

  3. Purpose
    - Stores rack-specific threshold overrides
    - If a rack has specific thresholds here, they take precedence over global thresholds
    - If no specific threshold exists, system falls back to threshold_configs table
    - Enables granular control over alerting per rack

  4. Supported Threshold Keys (matching current system)
    - Temperature: critical_temperature_low/high, warning_temperature_low/high
    - Humidity: critical_humidity_low/high, warning_humidity_low/high  
    - Amperage Single Phase: critical_amperage_low/high_single_phase, warning_amperage_low/high_single_phase
    - Amperage 3-Phase: critical_amperage_low/high_3_phase, warning_amperage_low/high_3_phase
*/

-- Create the rack_threshold_overrides table
CREATE TABLE dbo.rack_threshold_overrides (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    rack_id NVARCHAR(255) NOT NULL,
    threshold_key NVARCHAR(255) NOT NULL,
    value DECIMAL(18, 4) NOT NULL,
    unit NVARCHAR(50),
    description NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    
    -- Unique constraint to prevent duplicate thresholds for the same rack
    CONSTRAINT UK_rack_threshold_overrides_rack_key UNIQUE (rack_id, threshold_key)
);

-- Create indexes for performance
CREATE INDEX IX_rack_threshold_overrides_rack_id ON dbo.rack_threshold_overrides(rack_id);
CREATE INDEX IX_rack_threshold_overrides_threshold_key ON dbo.rack_threshold_overrides(threshold_key);
CREATE INDEX IX_rack_threshold_overrides_created_at ON dbo.rack_threshold_overrides(created_at);

-- Insert some example rack-specific thresholds (optional - for testing)
INSERT INTO dbo.rack_threshold_overrides (rack_id, threshold_key, value, unit, description) VALUES
('rack_001', 'critical_amperage_high_single_phase', 30.0, 'A', 'Higher critical amperage for high-capacity rack 001'),
('rack_002', 'warning_temperature_high', 25.0, 'C', 'Lower temperature warning for sensitive rack 002'),
('rack_003', 'critical_humidity_low', 15.0, '%', 'Lower critical humidity for rack 003 in dry environment');