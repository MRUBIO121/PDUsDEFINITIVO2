/*
  # Add Phase-specific Amperage and Environmental Thresholds

  1. New Thresholds
    - Temperature thresholds (critical/warning, low/high)
    - Humidity thresholds (critical/warning, low/high)
    - Amperage thresholds divided by phases A, B, C (critical/warning, low/high)

  2. Table Structure
    - Uses existing `threshold_configs` table
    - Adds new threshold keys for phase-specific amperage
    - Maintains existing structure with key, value, unit, description

  3. Phase-specific Configuration
    - Each phase (A, B, C) has its own amperage thresholds
    - Allows different limits for different electrical phases
*/

-- Insert new thresholds for temperature, humidity and phase-specific amperage
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
    
    -- Amperage thresholds - Phase A
    ('critical_amperage_low_phase_a', 1.0, 'A', 'Critical low amperage threshold for Phase A'),
    ('critical_amperage_high_phase_a', 25.0, 'A', 'Critical high amperage threshold for Phase A'),
    ('warning_amperage_low_phase_a', 2.0, 'A', 'Warning low amperage threshold for Phase A'),
    ('warning_amperage_high_phase_a', 20.0, 'A', 'Warning high amperage threshold for Phase A'),
    
    -- Amperage thresholds - Phase B
    ('critical_amperage_low_phase_b', 1.0, 'A', 'Critical low amperage threshold for Phase B'),
    ('critical_amperage_high_phase_b', 25.0, 'A', 'Critical high amperage threshold for Phase B'),
    ('warning_amperage_low_phase_b', 2.0, 'A', 'Warning low amperage threshold for Phase B'),
    ('warning_amperage_high_phase_b', 20.0, 'A', 'Warning high amperage threshold for Phase B'),
    
    -- Amperage thresholds - Phase C
    ('critical_amperage_low_phase_c', 1.0, 'A', 'Critical low amperage threshold for Phase C'),
    ('critical_amperage_high_phase_c', 25.0, 'A', 'Critical high amperage threshold for Phase C'),
    ('warning_amperage_low_phase_c', 2.0, 'A', 'Warning low amperage threshold for Phase C'),
    ('warning_amperage_high_phase_c', 20.0, 'A', 'Warning high amperage threshold for Phase C')
) AS source (threshold_key, value, unit, description)
ON target.threshold_key = source.threshold_key
WHEN MATCHED THEN 
    UPDATE SET value = source.value, unit = source.unit, description = source.description, updated_at = GETDATE()
WHEN NOT MATCHED THEN 
    INSERT (threshold_key, value, unit, description) 
    VALUES (source.threshold_key, source.value, source.unit, source.description);