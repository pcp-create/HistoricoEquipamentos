# Calendário integrado

`/calendario` reúne os compromissos pessoais em uma visão única. O mesmo componente
é utilizado no Portal Técnico, Portal Vendedor e no calendário de Tarefas.
Nos portais, o filtro inicial mostra todas as origens; em Tarefas, começa em tarefas.
Há filtros por origem, situação, pesquisa, data e visões de mês, semana e dia.
O novo módulo Calendário geral oferece atalhos para cada origem.

## Dados e acesso

`GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD` exige sessão e usuário ativo.
O intervalo máximo é de 93 dias. A identidade vem da sessão, nunca de parâmetros.
Não há restrição por cargo: uma pessoa pode atuar como técnico e vendedor.

- Operações: programação ativa, já enviadas, atribuídas ao responsável ou apoio.
  O encerramento pessoal também identifica a participação como concluída.
- Visitas: agendadas, realizadas ou canceladas, atribuídas ao usuário. Clientes e
  leads aparecem mesmo que a carteira ou o responsável pelo lead tenha mudado.
- Tarefas: prazo das tarefas atribuídas ou em acompanhamento. Tarefas restritas
  só aparecem para administradores. Tarefas sem prazo continuam na lista de tarefas.

Todos os eventos são projetados das tabelas originais a cada consulta. Não há cópia,
recriação de agendamentos, migração SQL ou mudança no integrador. Alterar ou excluir
um registro reflete nas agendas após atualização. A agenda atualiza ao retornar à
janela, reconectar e a cada minuto; ações dos portais também atualizam os dados.
A agenda pessoal não amplia acesso a compromissos de outros usuários. No módulo
Tarefas, o calendário preserva a abrangência da lista e seus filtros de responsável,
equipamento e situação, usando apenas os registros já autorizados no módulo. A gestão de
visitas mantém sua visão de equipe e as permissões atuais.

Operações e prazos usam a data civil cadastrada; instantes de visitas são convertidos
para America/Sao_Paulo, inclusive na seleção dos limites do período. Cada evento tem
identidade composta por origem e ID, evitando colisões entre módulos.

Abrir uma operação no portal técnico mantém o fluxo operacional; abrir uma visita
pelo calendário geral seleciona a data no portal do vendedor. No portal do vendedor,
os cartões mantêm as ações existentes de visita. Tarefas abrem o detalhe existente.

## Aplicativo e offline

O APK 2.2.28 contém a nova interface. Instalar sobre a versão existente, sem limpar
dados. A API da agenda usa o cache autenticado já existente, separado por conta e
período. Não altera a fila de apontamentos ou as projeções offline das operações.
Períodos já consultados podem ser lidos offline; a data da última atualização fica
visível. Se não houver cache do período, o portal técnico oferece os dados da
programação já baixada. Visitas e tarefas abrem o portal web correspondente.

Validação: testes PostgreSQL com PGlite para acesso e limites de datas; navegador
com os componentes reais dos dois portais, filtros e tela móvel; teste do pacote
nativo com SQLite, abertura da operação pela agenda e consulta com servidor suspenso.
