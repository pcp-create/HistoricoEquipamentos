# Equipamentos e preventivas

Acesse **Equipamentos** no menu principal. O módulo consulta o cadastro compartilhado M8 e os vínculos atuais com clientes. Não é necessário selecionar empresa: o histórico reúne RJ Indústria, Serrana e Criciúma.

## Lista e gestão

- Pesquise por nome, código do equipamento, marca, modelo, série ou cliente.
- Classifique cada equipamento como próprio ou de cliente. O padrão é não classificado; ausência de vínculo não significa propriedade da empresa.
- A lista apresenta a última OS processada vinculada e a situação prioritária dos planos ativos.
- Em **Gerenciar**, consulte as últimas 30 OS, incluindo vínculos validados pelo número de série ou pelas observações. Vínculos pendentes de revisão ou desatualizados não são tratados como confirmados.
- Os vínculos de clientes e dados cadastrais continuam sendo mantidos no M8. As configurações internas e os planos são independentes do integrador.

## Configurar operação

Informe horas de operação por dia (até 24) e dias de operação por ano (até 365). Para 24 horas todos os dias, use 24 e 365.

A leitura real mais recente do horímetro e sua data são opcionais e devem ser preenchidas juntas. Sem uma leitura mais recente, cada plano usa a data e o horímetro de sua última intervenção. Não são aceitas leituras posteriores com valor inferior ao da intervenção.

Salve a operação antes de salvar o plano. O cálculo utiliza os dados persistidos; a prévia no formulário também pode considerar alterações da operação ainda não salvas.

## Criar plano

Cada equipamento pode ter vários planos, por exemplo preventiva de 4.000, 8.000 e 16.000 horas.

Informe nome do serviço e pelo menos um intervalo:

- Horas de funcionamento;
- Meses corridos;
- Ambos: vence pelo limite que chegar primeiro.

Informe a data da última intervenção e, para previsão por horas, seu horímetro. Pode salvar com referência inicial pendente, mas a previsão será marcada como incompleta. Para o primeiro serviço, a referência pode ser a data e leitura de início da operação.

O campo de OS é opcional e aceita o ID de uma OS já vinculada ao equipamento na base. Notas do plano podem descrever peças, serviços e condições; não criam automaticamente materiais, orçamentos ou OS no ERP.

## Cálculo

```text
Horímetro alvo = horímetro da última intervenção + intervalo em horas
Horas médias por dia corrido = horas de operação por dia × dias de operação por ano ÷ 365
Dias restantes = arredondar para cima((alvo − última leitura) ÷ horas médias por dia)
Data por horas = data da última leitura + dias restantes
Data por meses = data da última intervenção + intervalo em meses
Próximo serviço = menor data disponível
```

Se não houver leitura posterior à intervenção, a própria intervenção é usada como leitura inicial.

Exemplo: intervenção em 14/09/2026, horímetro de 1.000 horas, intervalo de 4.000 horas e operação 24 × 365. O alvo é 5.000 horas, com previsão após 167 dias, em 28/02/2027. Se houver também intervalo de três meses, vence antes: 14/12/2026.

Meses são somados pelo calendário, ajustando para o último dia quando necessário (31 de janeiro + um mês → 28 ou 29 de fevereiro). As datas de entrada são datas civis, sem conversão de fuso; o dia atual é calculado em Brasília.

A previsão por horas distribui a carga anual uniformemente pelos dias corridos. Não representa telemetria nem conhece feriados, paradas ou escalas específicas. Uma leitura real que já atingiu o alvo sinaliza limite atingido mesmo sem regime operacional. Se apenas um dos dois limites puder ser calculado, a tela indica previsão parcial.

As situações são: vencida por estimativa, limite atingido, próximos 30 dias, programada e dados incompletos. Equipamentos sem plano também podem ser filtrados. A situação prioritária na lista considera primeiro vencidas, depois limite atingido, próximas, incompletas e programadas.

## Registrar manutenção

Use o ícone de ferramenta ao lado do plano. Informe data, horímetro, OS opcional e observações. O registro reinicia **somente o plano selecionado**. A realização de uma revisão de 8.000 horas não reinicia automaticamente a de 4.000 horas; registre os serviços efetivamente realizados em cada plano.

Uma OS processada encontrada no histórico não comprova por si só a execução de uma preventiva. Nesta etapa, a atualização do plano é manual. A integração com assistência técnica ficará para outra etapa.

Edição, configuração, manutenção e arquivamento mantêm registro de usuário, Display name, data e valores anteriores. Alterações simultâneas são rejeitadas até reabrir os dados. Arquivar retira o plano das previsões, preservando o histórico.

## Instalação

Migration: `web/sql/007_equipment_preventive.sql`, incluída em `web/scripts/setup-search.mjs`.

```bash
cd web
npm run db:search
```

Tabelas adicionais: `web_equipment_settings`, `web_equipment_plans`, `web_equipment_events`. RLS habilitada, acesso direto de anon/authenticated revogado. A aplicação consulta e grava após validar a sessão e a lista de e-mails autorizados. Gravações exigem mesma origem e transação de escrita explícita.

Não há alteração no integrador M8 ou necessidade de timer adicional. A estimativa é recalculada a cada consulta. Esta versão não envia notificações automáticas nem abre OS ou orçamentos.

### Máquinas de locação

Equipamentos cujo `payload.familiaId` é 3 são identificados automaticamente como máquinas próprias de locação. A lista e o detalhamento exibem essa condição, e o botão **Máquinas de locação** filtra o cadastro. Essa classificação prevalece sobre a classificação manual enquanto o M8 mantiver a família 3. O cliente atribuído continua visível para identificar a alocação da máquina.

### Situação comercial da máquina de locação

A etiqueta ao lado de “Máquina própria de locação” usa as OS em que o ID do equipamento aparece como `produto_id` na lista de produtos, nas três empresas. Itens excluídos ou explicitamente reprovados e OS canceladas são desconsiderados.

- Pendente, tipo 8: Locado (azul).
- Pendente, tipo 45: Emprestado (roxo).
- Pendente, qualquer outro tipo (exceto 8 e 45): Reservado (amarelo).
- Sem um desses empenhos pendentes, se a última OS válida for Processado e tipo 24 e o estoque total coletado do produto for exatamente zero: Vendido (vermelho suave). O total soma os estabelecimentos das três empresas. Saldo positivo (por exemplo, recompra), negativo ou ausente não confirma venda; sem empenhos pendentes, permanece Disponível. A regra usa o estoque total, não o disponível, e acompanha a última coleta do integrador.
- Sem os status anteriores, estoque total conhecido menor ou igual a zero: Indisponível, com motivo e saldo ao lado.
- Demais casos: Disponível (verde). Quando o saldo total for maior que 1, exibe aviso para conferir e ajustar. Saldo desconhecido não é tratado como zero.

Entre empenhos pendentes concorrentes, prevalece o mais recente. A ordenação considera emissão (ou abertura se ausente), com ID numérico como desempate. O tooltip mostra a OS e empresa determinantes. O estado reflete a base sincronizada, não uma consulta em tempo real ao M8.
