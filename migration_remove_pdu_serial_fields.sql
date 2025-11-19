/*
  # Remove PDU ID and Serial fields from maintenance tables

  ## Changes
  - Remove `pdu_id` column from `maintenance_rack_details` table
  - Remove `serial` column from `maintenance_rack_details` table

  ## Notes
  - These fields are no longer needed in the maintenance tracking system
  - Data will be permanently deleted when this migration is applied
  - This script is for SQL Server

  ## Usage
  - Execute this script in your SQL Server database
  - The script checks if columns exist before dropping them
*/

-- Remove pdu_id column if it exists
IF EXISTS (
  SELECT 1
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'maintenance_rack_details'
  AND COLUMN_NAME = 'pdu_id'
)
BEGIN
  ALTER TABLE maintenance_rack_details
  DROP COLUMN pdu_id;
  PRINT 'Column pdu_id dropped successfully';
END
ELSE
BEGIN
  PRINT 'Column pdu_id does not exist, skipping';
END;
GO

-- Remove serial column if it exists
IF EXISTS (
  SELECT 1
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'maintenance_rack_details'
  AND COLUMN_NAME = 'serial'
)
BEGIN
  ALTER TABLE maintenance_rack_details
  DROP COLUMN serial;
  PRINT 'Column serial dropped successfully';
END
ELSE
BEGIN
  PRINT 'Column serial does not exist, skipping';
END;
GO

PRINT 'Migration completed successfully';
GO
