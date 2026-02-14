
-- Fix overly permissive INSERT policies
DROP POLICY "Insert bed_activity_logs" ON public.bed_activity_logs;
CREATE POLICY "Insert bed_activity_logs" ON public.bed_activity_logs FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid());

DROP POLICY "Insert work_logs" ON public.work_logs;
CREATE POLICY "Insert work_logs" ON public.work_logs FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'supervisor'));

DROP POLICY "Insert inventory_movements" ON public.inventory_movements;
CREATE POLICY "Insert inventory_movements" ON public.inventory_movements FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));
