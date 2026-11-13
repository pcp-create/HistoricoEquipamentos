BEGIN;
DROP INDEX IF EXISTS public.web_contact_job_types_name_unique;
ALTER TABLE public.web_contact_job_types ADD COLUMN IF NOT EXISTS m8_user_id integer;
ALTER TABLE public.web_contact_job_types ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;
INSERT INTO public.web_contact_job_types(m8_id,name,m8_user_id,active,excluded,updated_by) VALUES
(3,'AUXILIAR DE PRODUÇÃO',7,true,false,'sistema:carga-solicitada'),
(4,'CIRCULEIRO',7,true,false,'sistema:carga-solicitada'),
(24,'COMERCIAL',17,true,false,'sistema:carga-solicitada'),
(39,'COMPRADOR',16,true,false,'sistema:carga-solicitada'),
(21,'COMPRAS',15,false,false,'sistema:carga-solicitada'),
(27,'COMPRAS',17,true,true,'sistema:carga-solicitada'),
(30,'COMPRAS',9,true,false,'sistema:carga-solicitada'),
(8,'COMPRAS',15,true,false,'sistema:carga-solicitada'),
(26,'COORDENADOR DE MANUTENÇÃO',17,true,false,'sistema:carga-solicitada'),
(33,'COORDENADOR DE UTILIDDADES',16,true,false,'sistema:carga-solicitada'),
(14,'DIRETOR',19,true,false,'sistema:carga-solicitada'),
(19,'DONO(A)',15,true,false,'sistema:carga-solicitada'),
(10,'E-MAIL ELETRÔNICO',15,true,false,'sistema:carga-solicitada'),
(25,'ENGENHARIA DE CONTRATOS',9,true,false,'sistema:carga-solicitada'),
(9,'FINANCEIRO',15,true,false,'sistema:carga-solicitada'),
(15,'FISCAL',15,true,false,'sistema:carga-solicitada'),
(2,'GERENTE ADMNISTRATIVO',1,true,false,'sistema:carga-solicitada'),
(22,'GERENTE DE MANUTENÇÃO',17,true,false,'sistema:carga-solicitada'),
(34,'GERENTE DE SERVIÇOS',17,true,false,'sistema:carga-solicitada'),
(13,'GERENTE DE UNIDADE',16,true,false,'sistema:carga-solicitada'),
(37,'GRUPO RJ',15,true,false,'sistema:carga-solicitada'),
(7,'IMPLANTAÇÃO',4,true,false,'sistema:carga-solicitada'),
(1,'MANUTENÇÃO',16,true,false,'sistema:carga-solicitada'),
(20,'MANUTENÇÃO',17,true,true,'sistema:carga-solicitada'),
(18,'MANUTENÇÃO FUNDIÇÃO',9,true,false,'sistema:carga-solicitada'),
(6,'MOTORISTA',7,true,false,'sistema:carga-solicitada'),
(35,'OPERAÇÕES',17,true,false,'sistema:carga-solicitada'),
(12,'ORÇAMENTISTA',15,true,false,'sistema:carga-solicitada'),
(16,'OUTROS',15,true,false,'sistema:carga-solicitada'),
(17,'PCM',9,true,false,'sistema:carga-solicitada'),
(32,'PLANEJADOR CIVIL',19,true,false,'sistema:carga-solicitada'),
(28,'PLANEJADORA DE MANUTENÇÃO',17,true,false,'sistema:carga-solicitada'),
(23,'PLANEJAMENTO E CONTROLE DE MANUTENÇÃO',9,true,false,'sistema:carga-solicitada'),
(38,'REPRESENTANTE',5,true,false,'sistema:carga-solicitada'),
(5,'SERRADOR',7,true,false,'sistema:carga-solicitada'),
(11,'SETOR DE SEGURANÇA',15,true,false,'sistema:carga-solicitada'),
(29,'SÓCIO / PROPRIETARIO.',9,true,false,'sistema:carga-solicitada'),
(31,'SUPERVISOR',16,true,false,'sistema:carga-solicitada'),
(36,'SUPRIMENTOS',17,true,false,'sistema:carga-solicitada')
ON CONFLICT(m8_id) DO UPDATE SET name=EXCLUDED.name,m8_user_id=EXCLUDED.m8_user_id,active=EXCLUDED.active,excluded=EXCLUDED.excluded,updated_by=EXCLUDED.updated_by,updated_at=now(),version=web_contact_job_types.version+1
WHERE (web_contact_job_types.name,web_contact_job_types.m8_user_id,web_contact_job_types.active,web_contact_job_types.excluded) IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.m8_user_id,EXCLUDED.active,EXCLUDED.excluded);
COMMIT;
