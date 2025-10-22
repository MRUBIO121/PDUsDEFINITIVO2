@@ .. @@
     -- Amperage thresholds - 3-Phase
     ('critical_amperage_low_3_phase', 1.0, 'A', 'Critical low amperage threshold for 3-Phase'),
     ('critical_amperage_high_3_phase', 30.0, 'A', 'Critical high amperage threshold for 3-Phase'),
     ('warning_amperage_low_3_phase', 2.0, 'A', 'Warning low amperage threshold for 3-Phase'),
-    ('warning_amperage_high_3_phase', 25.0, 'A', 'Warning high amperage threshold for 3-Phase')
+    ('warning_amperage_high_3_phase', 25.0, 'A', 'Warning high amperage threshold for 3-Phase'),
+    
+    -- Voltage thresholds
+    ('critical_voltage_low', 200.0, 'V', 'Critical low voltage threshold'),
+    ('critical_voltage_high', 250.0, 'V', 'Critical high voltage threshold'),
+    ('warning_voltage_low', 210.0, 'V', 'Warning low voltage threshold'),
+    ('warning_voltage_high', 240.0, 'V', 'Warning high voltage threshold'),
+    
+    -- Power thresholds
+    ('critical_power_high', 5000.0, 'W', 'Critical high power threshold'),
+    ('warning_power_high', 4000.0, 'W', 'Warning high power threshold')
 ) AS source (threshold_key, value, unit, description)
 ON target.threshold_key = source.threshold_key
 WHEN MATCHED THEN 
     UPDATE SET value = source.value, unit = source.unit, description = source.description, updated_at = GETDATE()
 WHEN NOT MATCHED THEN 
     INSERT (threshold_key, value, unit, description) 
     VALUES (source.threshold_key, source.value, source.unit, source.description);