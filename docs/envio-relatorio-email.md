# Relatório resumido por e-mail

Na programação de OSs, **Enviar por e-mail** substitui a opção de WhatsApp. O destinatário, assunto e mensagem podem ser conferidos antes de preparar o rascunho. Todas as operações precisam estar revisadas. O anexo contém o PDF resumido de todas as operações com relatório, sem linha do tempo e sem as observações exclusivas de orçamento.

Em **Configurações → Envio por e-mail**, configure assunto e texto padrão. São aceitos os marcadores `{os}`, `{cliente}`, `{equipamento}`, `{empresa}` e `{responsavel}`. A configuração usa a mesma versão e permissão das demais configurações da programação.

**Baixar e-mail com anexo** gera um arquivo MIME `.eml`, com o PDF incorporado. O usuário abre o arquivo em um aplicativo de e-mail compatível e faz o envio. O portal não afirma que houve envio apenas porque o arquivo foi preparado.

## Gmail

O login do Gmail no navegador não autoriza o portal a criar rascunhos. É necessário configurar uma aplicação Google:

1. Habilitar a Gmail API no projeto Google Cloud e configurar a tela de consentimento OAuth.
2. Criar um cliente OAuth do tipo aplicação Web e incluir `https://rjcompressores.app` nas origens JavaScript autorizadas (e outras origens usadas para homologação).
3. Informar apenas o Client ID público, terminado em `.apps.googleusercontent.com`, em **Configurações → Envio por e-mail → Conexão com o Gmail**. Nenhuma senha ou Client Secret é solicitado.
4. Configurar os usuários de teste ou a publicação/verificação exigida pelo Google para os escopos utilizados.
5. Ao clicar em **Criar rascunho no Gmail**, cada usuário escolhe e autoriza a própria conta. Os escopos são `gmail.compose`, `openid` e `email`.

A autorização temporária permanece apenas em memória. O navegador chama `users.drafts.create`, com a mensagem MIME e o PDF anexado, e abre os rascunhos na conta Google autorizada. O portal não chama endpoints de envio e não armazena tokens no banco, cookies ou localStorage. Se o navegador bloquear a abertura da nova aba, há um link para os rascunhos. O envio final é feito pelo usuário no Gmail.

Referências oficiais: [modelo de autorização Google Identity](https://developers.google.com/identity/oauth2/web/guides/use-token-model) e [criação de rascunhos Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create).
