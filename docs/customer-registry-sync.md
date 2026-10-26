# Clientes e vendedores — integração

## Situação atual

- Cadastro único por `person_id`, agregado das empresas 1, 2 e 27404; os complementos internos usam a chave canônica `(1, person_id)`.
- O integrador já coleta clientes pelo `syncEquipmentPeople` (`src/sync/equipmentRegistry.ts`) e faz upsert em `m8_customer_directory`. Clientes novos entram na nova tabela automaticamente na próxima leitura da tela.
- A atualização de detalhes pela interface consulta `GET /v1/configuracoes/cliente/{id}` e `GET /v1/configuracoes/cliente/{id}/vendedor`.
- `web_customer_registry.sellers` conserva os vínculos do M8, incluindo `vendedorId`, `vendedorNome` e `padrao`.
- `web_customer_registry.seller_user` é a atribuição interna explícita ao usuário do sistema. Define a carteira de visitas mesmo sem equipamentos e tem prioridade sobre cidade/UF. Null retorna à regra da Divisão Comercial.
- Sincronizar dados M8 NÃO sobrescreve `seller_user` nem `assignee`. Atribuições e alterações são auditadas.

## Sincronização automática — integrador 0.2.0

`npm run sync:customers -- --max-people=100` consulta o catálogo compartilhado pela empresa 1 a cada hora e mantém uma fila por cliente. O serviço `m8-clientes.timer` executa um lote a cada cinco minutos após a conclusão anterior. Cada detalhe e lista de vendedores é revisitado após 24 horas; falhas têm nova tentativa após 15 minutos. A primeira coleta completa ocorre em vários lotes (100 clientes por execução).

A migration 018 cria `m8_customer_commercial`, a fila e o checkpoint. Uma resposta incompleta ou com erro preserva o último snapshot. Uma lista de vendedores validamente vazia remove os vínculos importados. Não há escrita no ERP.

A interface usa o snapshot mais recente entre a sincronização manual e a automática. O integrador não escreve em `web_customer_registry`: `seller_user`, `assignee` e a versão das edições internas são preservados. A tela continua funcionando antes da instalação da migration 018.

Não confundir `indicadorVendaId` com `/vendedor`. A atribuição automática de usuários internos a partir dos vínculos do ERP ainda exige um mapeamento explícito `vendedorId -> usuário`. Nenhum vínculo é deduzido por semelhança de nomes.

Pacote e instalação: [atualizacao-comercial.md](atualizacao-comercial.md).
