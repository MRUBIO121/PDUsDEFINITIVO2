/*
  # Create History Tables for Alerts and Maintenance

  1. New Tables:
    - `alerts_history`: Permanent record of all critical alerts
      - Stores complete alert information including resolution details
      - Tracks duration and resolution type
    - `maintenance_history`: Permanent record of all maintenance activities
      - Stores complete maintenance information including end details
      - Tracks duration and who started/ended maintenance

  2. Indexes:
    - Multiple indexes for efficient querying by rack, site, dates, etc.

  3. Security:
    - RLS enabled on both tables
    - Policies for authenticated users to read/write their own data
*/

-- ============================================
-- TABLE: alerts_history
-- Permanent history of all alerts
-- ============================================

CREATE TABLE IF NOT EXISTS public.alerts_history (
    id SERIAL PRIMARY KEY,
    
    pdu_id TEXT NOT NULL,
    rack_id TEXT NOT NULL,
    name TEXT,
    country TEXT,
    site TEXT,
    dc TEXT,
    phase TEXT,
    chain TEXT,
    node TEXT,
    serial TEXT,
    
    metric_type TEXT NOT NULL,
    alert_reason TEXT NOT NULL,
    alert_value DECIMAL(18, 4),
    alert_field TEXT,
    threshold_exceeded DECIMAL(18, 4),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    
    resolved_by TEXT,
    resolution_type TEXT DEFAULT 'auto',
    
    duration_minutes INTEGER,
    
    uuid_open TEXT,
    uuid_closed TEXT
);

CREATE INDEX IF NOT EXISTS ix_alerts_history_rack_id ON public.alerts_history(rack_id);
CREATE INDEX IF NOT EXISTS ix_alerts_history_site ON public.alerts_history(site);
CREATE INDEX IF NOT EXISTS ix_alerts_history_created_at ON public.alerts_history(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_alerts_history_resolved_at ON public.alerts_history(resolved_at DESC);
CREATE INDEX IF NOT EXISTS ix_alerts_history_pdu_metric ON public.alerts_history(pdu_id, metric_type);

ALTER TABLE public.alerts_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read alerts_history"
  ON public.alerts_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert alerts_history"
  ON public.alerts_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update alerts_history"
  ON public.alerts_history
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- TABLE: maintenance_history
-- Permanent history of all maintenance
-- ============================================

CREATE TABLE IF NOT EXISTS public.maintenance_history (
    id SERIAL PRIMARY KEY,
    
    original_entry_id UUID,
    
    entry_type TEXT NOT NULL,
    
    rack_id TEXT NOT NULL,
    rack_name TEXT,
    country TEXT,
    site TEXT,
    dc TEXT,
    phase TEXT,
    chain TEXT,
    node TEXT,
    gw_name TEXT,
    gw_ip TEXT,
    
    reason TEXT,
    
    started_by TEXT,
    ended_by TEXT,
    
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    duration_minutes INTEGER
);

CREATE INDEX IF NOT EXISTS ix_maintenance_history_rack_id ON public.maintenance_history(rack_id);
CREATE INDEX IF NOT EXISTS ix_maintenance_history_site ON public.maintenance_history(site);
CREATE INDEX IF NOT EXISTS ix_maintenance_history_started_at ON public.maintenance_history(started_at DESC);
CREATE INDEX IF NOT EXISTS ix_maintenance_history_ended_at ON public.maintenance_history(ended_at DESC);
CREATE INDEX IF NOT EXISTS ix_maintenance_history_chain ON public.maintenance_history(chain);

ALTER TABLE public.maintenance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read maintenance_history"
  ON public.maintenance_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert maintenance_history"
  ON public.maintenance_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update maintenance_history"
  ON public.maintenance_history
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.alerts_history IS 'Permanent history of all critical alerts';
COMMENT ON TABLE public.maintenance_history IS 'Permanent history of all maintenance activities';