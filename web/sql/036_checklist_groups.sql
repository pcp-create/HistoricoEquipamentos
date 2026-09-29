-- Materialize legacy group captions as stable hierarchy without changing running snapshots.
DO $$
DECLARE cfg jsonb; templates jsonb='[]'; template jsonb; stage jsonb; stages jsonb; field jsonb; fields jsonb; groups jsonb; grp jsonb; group_name text; pos integer; idx integer;
BEGIN
 SELECT document INTO cfg FROM web_service_schedule_settings WHERE id=1 FOR UPDATE;
 FOR template IN SELECT value FROM jsonb_array_elements(cfg->'checklists') LOOP
  IF template ? 'stages' THEN
   stages='[]';
   FOR stage IN SELECT value FROM jsonb_array_elements(template->'stages') LOOP
    IF NOT(stage ? 'groups') THEN
     groups='[]';
     FOR field IN SELECT value FROM jsonb_array_elements(stage->'fields') LOOP
      IF template->>'id'='ccp' AND field->>'id' IN ('ccp-stage-6-field-4','ccp-stage-6-field-8') AND field->>'type'='photo' THEN
       field=jsonb_set(field,'{type}','"signature"');
      END IF;
      group_name=coalesce(nullif(trim(field->>'group'),''),'Geral');pos=NULL;
      SELECT (ordinality-1)::integer INTO pos FROM jsonb_array_elements(groups) WITH ORDINALITY WHERE value->>'name'=group_name LIMIT 1;
      IF pos IS NULL THEN
       groups=groups||jsonb_build_array(jsonb_build_object('id',(stage->>'id')||'-group-'||(jsonb_array_length(groups)+1),'name',group_name,'fields',jsonb_build_array(field)));
      ELSE
       groups=jsonb_set(groups,ARRAY[pos::text,'fields'],(groups->pos->'fields')||jsonb_build_array(field));
      END IF;
     END LOOP;
     fields='[]';FOR grp IN SELECT value FROM jsonb_array_elements(groups) LOOP fields=fields||(grp->'fields');END LOOP;
     stage=jsonb_set(jsonb_set(stage,'{groups}',groups),'{fields}',fields);
    END IF;
    stages=stages||jsonb_build_array(stage);
   END LOOP;
   template=jsonb_set(template,'{stages}',stages);
  END IF;
  templates=templates||jsonb_build_array(template);
 END LOOP;
 IF cfg->'checklists' IS DISTINCT FROM templates THEN
  UPDATE web_service_schedule_settings SET document=jsonb_set(document,'{checklists}',templates),version=version+1,updated_at=now() WHERE id=1;
 END IF;
END $$;
