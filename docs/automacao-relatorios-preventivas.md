> Atualização: os modelos atuais usam destinatários do cadastro de funcionários nas execuções de produção. Consulte [Cadastro de funcionários e alertas](cadastro-funcionarios-alertas.md) para atualizar os seis workflows; a lista fixa `recipients` não é mais utilizada. Em teste permanecem `testEmail` e `phone`.

# Relatórios automáticos de preventivas

API preparada para publicação; nenhum workflow remoto foi criado, publicado ou ativado. Não houve envio real nesta etapa. A credencial SMTP já foi validada pelo usuário no n8n 2.30.5.

## Arquivos para importar no n8n

- `automations/n8n/preventivas-weekly.json`: segunda-feira às 07:00, somente planos que vencem nos próximos 30 dias, sem itens em dia.
- `automations/n8n/preventivas-overdue.json`: segunda a sexta às 07:00, vencidas/limite atingido. Sem envio automático quando não há vencidas (teste manual ainda gera relatório vazio).

Os três usam `America/Sao_Paulo`, estão despublicados e vêm com `testMode: true`. O teste envia somente para Guilherme. Após mudar `testMode` para `false`, os destinatários são Guilherme e Bruno, conforme solicitado. Feriados em dias úteis não são excluídos.

Remetente: guilherme.waltrick@rjserranacompressores.com.br.
Destinatários: guilherme.waltrick@rjserranacompressores.com.br e bruno.pereira@rjcompressores.com.br.
WhatsApp de teste: 554797530760, instância informada BotDemandas.

- `automations/n8n/preventivas-monthly.json`: dia 1º de cada mês às 07:00, visão geral incluindo em dia, próximos do vencimento e vencidos. Essa agenda mensal foi adotada como padrão e pode ser ajustada no nó Agenda Brasília.

## API e prévia no sistema

Nova rota `GET /api/preventive-reports?kind=weekly|overdue|monthly&format=json|pdf|html`.
- Administradores autenticados podem baixar PDFs acessando `/api/preventive-reports?kind=weekly&format=pdf` ou `/api/preventive-reports?kind=overdue&format=pdf`.
- Automação usa `Authorization: Bearer <TOKEN>`; token exclusivo do relatório, mínimo 32 caracteres, comparação constante. Configure `PREVENTIVE_REPORT_TOKEN` no servidor do sistema, nunca com prefixo NEXT_PUBLIC.
- Para gerar um token: `openssl rand -hex 32`. Guarde no ambiente do sistema e em credencial do n8n, não no workflow nem no Git.
- JSON traz assunto, HTML, texto, resumo WhatsApp e PDF base64, todos gerados na mesma consulta. A rota apenas consulta/gera, não envia mensagens nem altera os planos.
- Não há token na URL, cache compartilhado nem acesso anônimo.

A publicação desta etapa no GitHub foi autorizada. Aguarde o deploy desta implementação e configure o token no ambiente publicado antes de executar o workflow. A prévia local em `.m8/preventive-reports/` não deve ser commitada.

## Passo a passo no n8n

1. Importe cada JSON como um workflow novo. Preserve o workflow de teste SMTP existente.
2. Abra o nó **Configuração**. `systemUrl` aponta para `https://historicorj.vercel.app`; ajuste caso o sistema seja hospedado em outro endereço. Não use `127.0.0.1` para alcançar o Codespace a partir do servidor n8n.
3. Crie uma credencial **Header Auth** chamada `Gestão Integrada — Relatórios`: Name `Authorization`, Value `Bearer <TOKEN>`. Selecione em **Gerar relatório**. Não use a chave do Evolution aqui.
4. Em **Enviar e-mail**, selecione a credencial **SMTP account** que já foi testada. PDF usa propriedade binária `report`. Formato `Both` é HTML + texto alternativo; o PDF é o anexo. A assinatura automática do n8n fica desativada.
5. Execute **Teste manual**. Confira assunto, destinatário, números do resumo e PDF completo. Cada execução manual pode enviar novamente.
6. Configure o WhatsApp conforme abaixo e teste separadamente. O nó está inicialmente desativado.
7. Só depois da validação, mude `testMode: false`, salve e publique os workflows. Confira o fuso `America/Sao_Paulo` nas configurações. Publicar o workflow é uma ação separada de publicar o sistema.

## Evolution / WhatsApp

O webhook `/webhook/evolution` recebe eventos; o envio usa a API do Evolution. O nó preparado usa `POST /message/sendText/BotDemandas`, corpo JSON `{number, text}` e credencial Header Auth com Name `apikey`.

Em **Configuração**, substitua `http://EVOLUTION_INTERNO:8080` pelo endereço acessível ao contêiner n8n. Quando estiverem na mesma rede Docker, use o nome do serviço Evolution e sua porta interna. Para acesso externo, configure HTTPS antes de transmitir a chave; o Manager informado usa HTTP público. Não altere o webhook já utilizado pelas outras automações.

Selecione a credencial Evolution no nó **Enviar WhatsApp** e habilite-o para testar. Não há chave embutida nos arquivos. Validar o envio ao próprio número da instância e o endpoint na instalação 2.3.7 antes de ativar a agenda. O WhatsApp leva resumo dos primeiros dez planos e indica que a relação completa foi enviada por e-mail; o PDF vai no e-mail.

## Regras do relatório

- Mesma função `predict` e mesma apuração de tempo parado (`rentalUsage`) usadas pelo sistema.
- Uma máquina com plano vencido/limite atingido entra no alerta diário. Este mostra somente os planos vencidos dessa máquina.
- Sem vencidas, dados incompletos ou inconsistentes impedem classificar a máquina como em dia.
- Sem pendências, qualquer plano com vencimento até 30 dias coloca a máquina no semanal como próxima; demais máquinas completas entram como em dia somente no mensal. O semanal lista apenas os planos próximos do vencimento; o mensal também inclui equipamentos vencidos.
- Sem plano também conta como cadastro incompleto, nunca como OK.
- O resumo informa quantos equipamentos estão sem previsão completa. O PDF lista todos os planos selecionados, agrupando as informações por item; o e-mail limita a tabela a 30 linhas. Revisões menores não são ocultadas: o relatório informa que uma maior pode cobri-las.
- Horímetro atual é identificado como estimativa. Data/OS e horímetro da última intervenção são dados cadastrados.

## Operação e limites desta etapa

As execuções e os retornos de envio ficam em **Executions** do n8n, conforme a retenção configurada no servidor. Ainda não há tela de logs de envio no sistema nem cadastro de preferências por funcionário.

Os nós não têm repetição automática de envio habilitada. Não há garantia de deduplicação entre execuções manuais ou reexecuções. Se e-mail for enviado e WhatsApp falhar, não repita o fluxo inteiro: retome somente o canal que falhou. Para operação com retentativas automáticas, implementar registro persistente por data/tipo/canal antes de habilitá-las. A resposta SMTP de aceitação não comprova leitura do e-mail.

## Validação realizada

Testes de classificação, limite de 30 dias, exclusão de dados incompletos do OK, aluguel parado, escape de HTML, autenticação por token e PDF com múltiplas páginas. Prévias geradas com consulta real em 21/09/2026: semanal 97 equipamentos/214 planos; vencidas 298 equipamentos/502 planos. Nenhuma mensagem enviada pelo agente.

Referências: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/ e https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/.
