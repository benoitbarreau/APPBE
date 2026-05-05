-- ── Rétro-alimentation client_name et lieu depuis les données JSONB ─────────
-- À exécuter après 008_project_enhancements.sql si des projets existants
-- ont leurs colonnes client_name / lieu vides.

UPDATE public.projects
SET
  client_name = COALESCE(NULLIF(trim(data->'projectMeta'->>'client'), ''), ''),
  lieu        = COALESCE(NULLIF(trim(data->'projectMeta'->>'lieu'),   ''), '')
WHERE
  client_name = ''
  OR lieu = '';
