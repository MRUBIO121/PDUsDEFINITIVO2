@@ .. @@
         chain NVARCHAR(255),
         node NVARCHAR(255),
         serial NVARCHAR(255),
-        current DECIMAL(18, 4), -- Only electrical metric we store
+        [current] DECIMAL(18, 4), -- Only electrical metric we store
         temperature DECIMAL(18, 4),