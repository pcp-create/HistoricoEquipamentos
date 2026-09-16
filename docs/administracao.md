# Administração e acessos

A aba **Administração** fica disponível apenas para administradores. A migração
`web/sql/008_administration.sql`, executada por `cd web && npm run db:search`,
configura `guih.waltrick@gmail.com` como primeiro administrador.

Para autorizar alguém, crie e confirme a conta no Supabase Auth. Depois, na
Administração, informe o e-mail, escolha Usuário ou Administrador e habilite o
acesso. Senhas continuam sendo gerenciadas pelo Supabase. Não é necessário editar
código ou publicar novamente para mudar permissões.

Usuários mantêm as funções operacionais atuais. Administradores também podem
consultar este painel e gerenciar acessos. A API valida a permissão no servidor;
não permite remover ou bloquear o último administrador ativo.

`WEB_ALLOWED_EMAILS` permanece como autorização inicial de contas sem registro no
painel. No primeiro acesso, essas contas recebem o perfil Usuário. Uma permissão
salva no painel prevalece sobre a variável, inclusive quando bloqueada.

## Atividade e integrações

- Online indica atividade registrada nos últimos dois minutos. A página visível
  envia um sinal por minuto; é uma aproximação, não uma conexão em tempo real.
- Último login e última atividade passam a ser registrados com esta versão.
  Contas com sessão já aberta podem ter atividade sem uma data de login até entrar novamente.
- O painel mostra os últimos 100 eventos de login, saída e alteração de acesso.
  Não registra senhas, tokens ou tentativas de login malsucedidas. Falhas no
  registro de auditoria de login/saída são registradas no servidor e não impedem a sessão.
- As datas de OS, produtos e equipamentos vêm do estado persistido pelo integrador.
  Não comprovam que o serviço Linux está ativo neste momento.
- A lista de execuções mostra os últimos 30 registros disponíveis no log do
  integrador; nem todas as rotinas escrevem nesse log. Consulte também as datas
  específicas de cada rotina. O cadastro de equipamentos é compartilhado pela empresa 1.
- Datas são exibidas no horário de Brasília. A tela atualiza a cada minuto e
  também permite atualização manual.

A migração deve estar aplicada antes de publicar o código web atualizado.
Os integradores existentes não precisam ser reinstalados para este painel.
