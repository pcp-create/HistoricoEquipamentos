# Configurações / Cadastros

O módulo Configurações é o último da página inicial. Cadastros reúne listas utilizadas pelo sistema; o primeiro cadastro disponível é Tipo Ordens de Serviço.

- Consulta disponível aos usuários autenticados e autorizados, sem exigir administrador.
- Fonte: `/v1/faturamento/tipoordemservico`, empresa 1, `Page=0&PageSize=0`, seguindo o contrato de consulta completa do M8.
- ID único global, nome e ativo persistidos em `m8_order_type_catalog`.
- Pesquisa por nome/ID, filtro ativo e data da última atualização.
- Atualização explícita pelo botão Atualizar do M8. Credenciais apenas no servidor (`M8_TENANT`, `M8_USERNAME`, `M8_PASSWORD`, opcionais `M8_API_URL` e `M8_DOMAIN`).
- Falhas, resposta vazia ou dados inválidos preservam o cadastro anterior. Registros ausentes da resposta não são removidos automaticamente.
- A lista é de consulta: alterações dos tipos devem ser feitas no M8. Novos cadastros manuais poderão ser adicionados ao submódulo.

Preparação, a partir de `web`:

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-order-type-catalog.mts
node --env-file=.env.local --conditions=react-server --import tsx scripts/sync-order-types.mts
```

## Tipos de Orçamento

Segundo cadastro, integrado a `/v1/crm/tipoorcamento` pela empresa 1. O campo `descricao` do M8 é exibido como Nome. ID e ativo são preservados, inclusive os tipos inativos. Dados persistidos separadamente em `m8_quote_type_catalog`, com atualização pelo botão Atualizar do M8.

Preparação: executar `scripts/setup-quote-type-catalog.mts` e `scripts/sync-quote-types.mts` com as mesmas opções Node descritas acima.

## Atualizações manuais das listas

Os dois cadastros são persistidos no banco e não fazem parte dos jobs/timers do integrador. Abrir a tela lê somente a base local. O botão Atualizar do M8 faz a atualização manual.

A migration `062_registry_manual_updates.sql` mantém por lista a data e o usuário da última atualização manual bem-sucedida. Esse registro é salvo na mesma transação dos tipos; erros preservam a data anterior. Cargas iniciais por script não são apresentadas como atualizações manuais. Até o primeiro uso do botão, a interface informa “ainda não realizada”. A data é exibida no horário de Brasília, inclusive se a pesquisa não retornar registros.

Preparação: `node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-registry-manual-updates.mts`.

## Divisão Comercial

O cadastro manual foi movido da Administração para Configurações → Cadastros → Divisão Comercial (`/configuracoes/cadastros/divisao-comercial`). Reutiliza a tabela e o editor existentes, sem migrar nem duplicar registros. Usuários autenticados e autorizados podem consultar e editar, mantendo validações, controle de versão e auditoria. O endpoint `/api/task-territories` exige autenticação e valida a origem nas alterações. A Administração não exibe mais essa seção.
