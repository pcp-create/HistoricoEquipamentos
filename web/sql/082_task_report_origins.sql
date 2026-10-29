BEGIN;
-- Restore provenance only when linked to a report workflow, preserving manual task behavior.
UPDATE web_tasks t SET origin='Revisão de relatório',version=version+1,updated_at=now()
WHERE t.origin='Ordem de Serviço' AND t.source_key LIKE 'manual:%'
AND (t.source_key LIKE 'manual:order-report-task:%' OR EXISTS (
  SELECT 1 FROM web_service_operations op
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(op.document->'checklistAlertTasks','[]'::jsonb)) entry
  WHERE entry->>'taskId'=t.id::text
));
COMMIT;
