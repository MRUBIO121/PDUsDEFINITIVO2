/*
  # Remove PDU ID and Serial fields from maintenance tables

  ## Changes
  - Remove `pdu_id` column from `maintenance_rack_details` table
  - Remove `serial` column from `maintenance_rack_details` table

  ## Notes
  - These fields are no longer needed in the maintenance tracking system
  - Data will be permanently deleted when this migration is applied
*/

-- Remove pdu_id column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'maintenance_rack_details'
    AND column_name = 'pdu_id'
  ) THEN
    ALTER TABLE maintenance_rack_details DROP COLUMN pdu_id;
  END IF;
END $$;

-- Remove serial column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'maintenance_rack_details'
    AND column_name = 'serial'
  ) THEN
    ALTER TABLE maintenance_rack_details DROP COLUMN serial;
  END IF;
END $$;
