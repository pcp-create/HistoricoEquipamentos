# Anexos de Ordens de Serviço

Criação/edição de OS e edição do cabeçalho na programação permitem selecionar até 10 arquivos por envio, com até 3 MB por arquivo. Na criação os arquivos só são enviados após confirmar a OS no M8. Na edição é possível enviar pela seção de anexos ou junto ao salvamento. Os arquivos enviados ficam disponíveis na consulta do ERP, com download autenticado.

A integração segue o Swagger oficial `https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json`:

- POST `/v1/assistenciatecnica/ordemservico/{ordemServicoId}/anexo`: JSON `{nome, arquivo}`, com conteúdo em Base64.
- GET da mesma coleção: paginação Page/PageSize e retorno de id/descricao.
- GET `.../anexo/{anexoId}`: retorna tipo/arquivo (Base64). O portal entrega como download, sem executar conteúdo no navegador.

Empresa é selecionada na autenticação M8 do servidor; credenciais não são enviadas ao navegador. Rotas exigem login e o POST verifica a origem. O download limita os arquivos a 3 MB, compatível com o limite de resposta da hospedagem.

O banco registra apenas metadados, hash, resultado e auditoria; o arquivo permanece no M8. A chave empresa/OS/nome/hash evita duplicação. POST não tem repetição automática. Erros definitivos de validação podem ser reenviados; timeout/resposta incerta ficam bloqueados para conferência no ERP. Uma OS já confirmada não é recriada quando o anexo falha. A tela mantém somente os arquivos pendentes até serem enviados ou removidos; os arquivos selecionados não persistem após fechar/recarregar a página.

Antes de publicar:

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-order-attachments.mts
```

Aplica `096_order_attachments.sql`, com tabela protegida por RLS e sem acesso público. Não requer novo APK, pois o cadastro/edição de OS ocorre no portal web.

Validação: `tests/order-attachments.test.ts` (contrato M8, tamanhos, alvos, hashes, auditoria, isolamento de empresa e resposta incerta) e `tests/order-attachments.spec.ts` (seleção antes da criação, falha parcial, envio somente de pendências e link de download).
