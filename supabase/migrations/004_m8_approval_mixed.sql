-- O enum M8 retorna códigos numéricos OU rótulos em string (OS 3/empresa 1, OS 5/empresa 2).
-- Texto preserva ambos; payload mantém o tipo original recebido.
ALTER TABLE public.m8_ordens_servico
  ALTER COLUMN status_aprovacao TYPE text USING status_aprovacao::text;
