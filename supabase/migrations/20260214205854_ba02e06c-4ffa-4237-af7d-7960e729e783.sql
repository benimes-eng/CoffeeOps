
-- Add columns to bed_assignments for smart assignment tracking
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS density_used NUMERIC NOT NULL DEFAULT 30;
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS assigned_area NUMERIC;

-- Add new action types
ALTER TYPE public.bed_action_type ADD VALUE IF NOT EXISTS 'rain_cover';
ALTER TYPE public.bed_action_type ADD VALUE IF NOT EXISTS 'finished';
ALTER TYPE public.bed_action_type ADD VALUE IF NOT EXISTS 'maintenance_flag';

-- Add description to bed_activity_logs for maintenance (already has description column)

-- Create index on bed status for performance
CREATE INDEX IF NOT EXISTS idx_beds_status ON public.beds(status);
CREATE INDEX IF NOT EXISTS idx_beds_block_id ON public.beds(block_id);
CREATE INDEX IF NOT EXISTS idx_bed_assignments_active ON public.bed_assignments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lots_intake_date ON public.lots(intake_date);
CREATE INDEX IF NOT EXISTS idx_bed_activity_logs_bed_id ON public.bed_activity_logs(bed_id);
