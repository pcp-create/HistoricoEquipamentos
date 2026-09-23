# Funcionários, acesso e alertas

Administração → Funcionários e acessos concentra nome, e-mail de login/recebimento, setor, cargo, WhatsApp com país e DDD, perfil e situação do acesso. Somente administradores consultam ou alteram o cadastro. O último administrador ativo não pode ser bloqueado ou rebaixado.

Selecione os assuntos (Preventivas e/ou Locações/Empréstimos) e os canais (e-mail e/ou WhatsApp). Sem assuntos marcados não há recebimento; bloqueados não recebem. Não são cadastrados destinatários automaticamente durante a migração. Para manter os destinatários anteriores, cadastre/edite Guilherme e Bruno e marque os assuntos/canais desejados.

## Implantação

1. Aplicar `web/sql/009_employees.sql` após a migração 008. É aditiva e mantém os acessos existentes; preferências começam desmarcadas.
2. Publicar o código da aplicação. Configure `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no ambiente do servidor para criar novas contas. Nunca use prefixo NEXT_PUBLIC nessa variável ou coloque a chave no n8n.
3. Salvar o funcionário. Para contas novas, informar senha inicial (12–128 caracteres) e clicar **Criar conta de acesso**. Entregar a senha de forma privada. A criação confirma o e-mail informado pelo administrador: confira a identidade antes de criar. Não envia convite e não força troca de senha. Contas existentes continuam com a senha atual, vinculando-se pelo mesmo e-mail no login. E-mail fica fixo durante edição para não criar uma segunda identidade por engano.
4. Atualizar/importar os seis arquivos `automations/n8n/{preventivas,locacoes}-{overdue,weekly,monthly}.json`, preservando as credenciais de API, SMTP, Evolution, URL e instância do ambiente. Desativar fluxos antigos antes de ativar substitutos.
5. Testar com `testMode: true`, `testEmail` e `phone` de teste. O teste ignora os destinatários do cadastro. WhatsApp permanece desativado nos modelos até a configuração do canal.
6. Conferir cadastro e colocar `testMode: false`. Publicar/ativar os workflows no n8n. Agora os destinatários vêm do retorno autenticado da API a cada execução. Não existe fallback para a lista antiga se o cadastro não tiver destinatários.

Os ramos de e-mail e WhatsApp têm suas próprias listas; canal vazio não envia, telefones repetidos recebem uma única mensagem, e cada e-mail recebe individualmente o relatório/PDF. Não há necessidade de editar o fluxo ao alterar preferências. Execuções já iniciadas usam a lista coletada naquele momento. Evite reexecutar um fluxo completo após envio parcial para não duplicar mensagens.

Grupos de WhatsApp não são funcionários: mantenha envios para grupos em um ramo/fluxo separado explicitamente configurado. As preferências individuais não controlam mensagens recebidas como integrante de um grupo.

Agendas existentes preservadas: diário em dias úteis às 07h, semanal segunda às 07h e mensal dia 1 às 07h, America/Sao_Paulo. Os filtros de situação dos relatórios são preservados.

## Criação de contas e falhas

O cadastro local e a criação da conta são ações separadas. Se o serviço de autenticação falhar, o cadastro permanece salvo e permite nova tentativa. Nunca substituímos a senha de um login existente. Se uma criação tiver sucesso no Supabase mas a gravação local falhar, o login com a senha criada vincula a conta ao cadastro existente. Nenhuma senha é registrada no banco da aplicação ou auditoria.

Referência de provisionamento: [Supabase Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
