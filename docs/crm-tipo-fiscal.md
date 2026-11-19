# Tipo fiscal por tipo de proposta

Antes de publicar esta alteração, aplicar `web/sql/120_crm_proposal_tax_type.sql`.
A migração é aditiva e não escolhe equivalências automaticamente.

Em **Cadastros do CRM > Tipos de Proposta > Editar**, selecionar o **Tipo de orçamento fiscal (M8)**. As opções são consultadas no M8 pela empresa 1, como referência do cadastro compartilhado; a simulação utiliza a empresa da própria proposta.

O servidor resolve o vínculo atual ao carregar/salvar a proposta e gerar seu PDF, substituindo qualquer seleção antiga no documento. Sem vínculo, é possível salvar e gerar PDF sem impostos; o PDF com impostos informa que o cadastro deve ser configurado. Nenhuma escolha manual é solicitada na proposta.

O bloco fiscal dos produtos foi removido. Prazos já salvos são preservados, e o prazo de cada produto continua editável na coluna do resumo.
