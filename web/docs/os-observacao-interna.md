# Edição de observações e Status Fluxo

As consultas M8 `ordemservico` e `ordemservicocompleta` não retornam `observacaoInterna` no cabeçalho. Conferido no Swagger e em consultas reais em 19/11/2026.

A função da programação não exibe nem devolve esse campo ao carregar (`scope=observations-flow`). Ao salvar, o cliente omite `internalNotes` e o servidor remove `observacaoInterna` do PUT, inclusive se o M8 passar a retorná-lo no futuro. Nenhum valor vazio ou nulo é enviado para esse campo. Observação pública e Status Fluxo mantêm seus envios existentes (PUT e PATCH específico).

Não há recuperação de texto do histórico nem migração. Não foram feitas alterações de teste em OSs reais.

Documentação: https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json
