-- Fix multi-tenant document uniqueness:
-- document_sequences generates sequence numbers per organization (organization_id, prefix, year).
-- Global UNIQUE(lot_number) and UNIQUE(dispatch_number) prevent any subsequent organization
-- from creating their first lot (e.g. L-2026-00001) or first dispatch.
-- Make uniqueness scoped per tenant (organization_id, lot_number) and (organization_id, dispatch_number).

ALTER TABLE public.lots DROP CONSTRAINT IF EXISTS lots_lot_number_key;
ALTER TABLE public.lots DROP CONSTRAINT IF EXISTS lots_org_lot_number_key;
ALTER TABLE public.lots ADD CONSTRAINT lots_org_lot_number_key UNIQUE (organization_id, lot_number);

ALTER TABLE public.djibouti_dispatches DROP CONSTRAINT IF EXISTS djibouti_dispatches_dispatch_number_key;
ALTER TABLE public.djibouti_dispatches DROP CONSTRAINT IF EXISTS djibouti_dispatches_org_dispatch_num_key;
ALTER TABLE public.djibouti_dispatches ADD CONSTRAINT djibouti_dispatches_org_dispatch_num_key UNIQUE (organization_id, dispatch_number);
