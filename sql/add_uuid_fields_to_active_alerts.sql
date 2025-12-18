/*
  # Add UUID fields for external API integration

  1. Changes to `active_critical_alerts` table:
    - `uuid_open` (text, nullable): UUID returned by external API when alert is created/opened
    - `uuid_closed` (text, nullable): UUID returned by external API when alert is closed

  2. Purpose:
    - These fields will store UUIDs from an external API
    - uuid_open: populated when a new alert is created
    - uuid_closed: populated when an alert is resolved/closed

  3. Notes:
    - Both fields are nullable as they will be populated asynchronously
    - Using TEXT type for flexibility with different UUID formats from external APIs
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'active_critical_alerts'
    AND column_name = 'uuid_open'
  ) THEN
    ALTER TABLE public.active_critical_alerts ADD COLUMN uuid_open TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'active_critical_alerts'
    AND column_name = 'uuid_closed'
  ) THEN
    ALTER TABLE public.active_critical_alerts ADD COLUMN uuid_closed TEXT;
  END IF;
END $$;

COMMENT ON COLUMN public.active_critical_alerts.uuid_open IS 'UUID returned by external API when alert is created';
COMMENT ON COLUMN public.active_critical_alerts.uuid_closed IS 'UUID returned by external API when alert is closed';
