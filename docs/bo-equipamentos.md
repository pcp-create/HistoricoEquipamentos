# B.O — Boletins de ocorrência de equipamentos

O menu **Operações → B.O** permite pesquisar um equipamento por nome, código ou série e registrar a data da ocorrência, título e descrição completa. O registro guarda automaticamente o autor e a data/hora de criação. Também há acesso em Assistência Técnica.

As ocorrências ficam vinculadas ao ID do equipamento, não ao número de uma OS. No histórico do equipamento há uma seção de B.Os, inclusive quando ele deixa de estar presente na coleta do ERP. Novos registros exigem um equipamento disponível no cadastro. A lista inicial mostra as 100 ocorrências mais recentes; selecionar um equipamento mostra seu histórico completo.

No Portal Técnico, **Informações** da operação mostra os B.Os do equipamento selecionado para aquela operação. Se a operação não especifica uma máquina, usa os vínculos válidos da OS. Mostra data, título e trecho da descrição. Clicar/tocar no cartão expande a descrição completa e os dados de registro. A consulta participa dos dados da operação já sincronizados para consulta offline; alterações posteriores dependem de nova sincronização. Operações futuras consultam o mesmo histórico, sem duplicar ocorrências por OS.

## Instalação

Antes de publicar o código web:

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-equipment-occurrences.mts
```

A rotina aplica a migração `094_equipment_occurrences.sql`, com chave estrangeira para o catálogo, índice por equipamento/data e acesso ao banco restrito ao servidor. O cadastro e a consulta exigem sessão autenticada; gravações validam a origem da requisição. Não altera dados no ERP nem amplia a elegibilidade do catálogo de equipamentos.

A leitura no Android exige o APK atualizado: a interface do Portal Técnico é empacotada no aplicativo. O pacote 2.2.9 preparado junto às correções de execução incorpora a visualização de B.Os; a versão anterior não a exibe.

## Validação

Teste com PostgreSQL embarcado: isolamento por equipamento, ordem cronológica, descrição completa, autoria, preservação do histórico de equipamentos antigos, validação de entrada e migração reaplicável. Navegador: cadastro com seleção de máquina, expansão no celular e exibição em Informações no Portal Técnico.

## Registro pelo técnico

No menu da operação, o botão **Registrar B.O** abre um formulário dentro do Portal Técnico. O equipamento é preenchido a partir da operação; quando há várias máquinas vinculadas e nenhuma selecionada na programação, o técnico escolhe entre as máquinas da OS. O servidor valida a atribuição ao técnico ou integrante de apoio, o envio da operação e o vínculo do equipamento. O registro exige conexão e não depende de apontamento de horas, conferência de peças ou envio de relatório. Após salvar, abre Informações com o histórico atualizado.

### Equipamento informado diretamente na OS

A consulta e o cadastro pelo técnico também consideram o `produto_equipamento_id` da OS quando a operação não especifica um equipamento. Isso resolve o caso da OS 15211 (empresa 1, equipamento 21956, série 43326), que possui equipamento válido no ERP e ainda não possui vínculo na tabela auxiliar. A identificação continua restrita ao catálogo de equipamentos existente, sem promoção de produtos. Os B.Os dessa máquina também entram em Informações da operação.

## Exclusão pelo administrador no portal web

Ao abrir a ocorrência completa, o administrador encontra o ícone de lixeira ao lado dos dados de registro. A exclusão exige confirmação e nova validação de permissão no servidor. Usuários comuns e gestores não podem excluir, mesmo chamando a API diretamente. A ocorrência é removida das consultas do equipamento e das operações; o conteúdo anterior e o administrador responsável ficam registrados em `web_access_events`, na mesma transação da exclusão. Cópias offline já baixadas deixam de exibir o B.O após sincronização dos dados da operação. Não requer migração adicional.
