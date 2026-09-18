-- Fix invalid input value for enum bed_action_type: "maintenance_flag"
-- 1. Ensure 'maintenance_flag' and 'finished' exist in bed_action_type enum
ALTER TYPE public.bed_action_type ADD VALUE IF NOT EXISTS 'maintenance_flag';
ALTER TYPE public.bed_action_type ADD VALUE IF NOT EXISTS 'finished';

-- 2. Safely cast action_type to text in trigger function to prevent enum cast errors
CREATE OR REPLACE FUNCTION public.notify_on_bed_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _title TEXT;
  _message TEXT;
  _type TEXT;
  _bed_number TEXT;
  _user RECORD;
  _action_text TEXT;
BEGIN
  SELECT bed_number INTO _bed_number FROM public.beds WHERE id = NEW.bed_id;
  _action_text := NEW.action_type::TEXT;

  IF _action_text IN ('maintenance_start', 'maintenance_flag') THEN
    _title := 'Maintenance Alert';
    _message := 'Bed ' || COALESCE(_bed_number, 'Unknown') || ' requires maintenance. ' || COALESCE(NEW.description, '');
    _type := 'warning';
  ELSIF _action_text = 'assignment' THEN
    _title := 'New Coffee Assignment';
    _message := 'Coffee assigned to Bed ' || COALESCE(_bed_number, 'Unknown');
    _type := 'info';
  ELSIF _action_text IN ('finished', 'removal') THEN
    _title := 'Bed Ready for Collection';
    _message := 'Bed ' || COALESCE(_bed_number, 'Unknown') || ' is finished drying and ready.';
    _type := 'success';
  ELSE
    RETURN NEW;
  END IF;

  FOR _user IN 
    SELECT ur.user_id FROM public.user_roles ur 
    WHERE ur.organization_id = NEW.organization_id 
    AND ur.role IN ('owner', 'manager')
    AND ur.user_id != NEW.performed_by
  LOOP
    INSERT INTO public.notifications (user_id, organization_id, title, message, type)
    VALUES (_user.user_id, NEW.organization_id, _title, _message, _type);
  END LOOP;
  
  RETURN NEW;
END;
$$;
