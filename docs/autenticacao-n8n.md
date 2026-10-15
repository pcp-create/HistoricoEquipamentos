# Autenticação das automações no n8n

Tarefas e localizações usam a mesma credencial da aplicação, independente da
sessão de usuário e da apikey da Evolution.

Na Vercel, configure TASK_AUTOMATION_TOKEN (Production) com um segredo de pelo
menos 32 caracteres. Depois de alterar a variável, faça um novo deploy.
Se essa variável não existir, será usado PREVENTIVE_REPORT_TOKEN.
Se ambas existirem, somente TASK_AUTOMATION_TOKEN é usado.

No n8n, selecione uma credencial Header Auth:
- Name: Authorization
- Value: Bearer seguido de um espaço e do mesmo segredo configurado na Vercel.

Selecione essa credencial em todos os nós que chamam a aplicação (sincronização,
lembretes, resumo diário, confirmação de entrega e localização de clientes).
Nos nós que enviam WhatsApp pela Evolution, mantenha a credencial apikey da Evolution.

## Testar sem enviar mensagens

Crie um nó HTTP Request separado, método GET, com a mesma credencial:
- https://rjcompressores.app/api/tasks/automation
- ou https://rjcompressores.app/api/localities/automation

Uma resposta 200 com {"ok":true,"authenticated":true} confirma a autenticação,
sem sincronizar tarefas, reservar notificações ou consultar localizações.
Mantenha POST nos nós de execução dos fluxos.

## Diagnóstico

- 503 / AUTOMATION_TOKEN_NOT_CONFIGURED: segredo ausente ou com menos de 32
  caracteres no servidor. Configure na Vercel e publique novamente.
- 401 / AUTHORIZATION_MISSING: a credencial não está enviando Authorization.
- 401 / AUTHORIZATION_FORMAT: falta o prefixo Bearer ou o formato está incorreto.
- 401 / AUTOMATION_TOKEN_MISMATCH: a chave enviada difere da chave do servidor.

Espaços externos acidentais na variável e diferenças entre Bearer/bearer são
normalizados. O segredo continua sendo comparado exatamente.
Nenhum segredo é retornado ou registrado.
