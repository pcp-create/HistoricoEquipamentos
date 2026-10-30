# Parcial automática diária da projeção

A aplicação registra uma parcial da **competência do dia encerrado**, com as **três empresas**, às **00h de Brasília**, todos os dias, inclusive fins de semana. A captura registra o dia anterior: em 01/11 às 00h, fecha 31/10 e fica na competência de outubro. O cálculo das vendas pendentes usa o dia encerrado como referência, evitando deslocá-las para o novo mês. Capturas manuais continuam disponíveis.

A gravação usa a mesma projeção do resumo gerencial: documentos, contratos, metas e totais são congelados. Não depende de alguém manter a página aberta. Não envia mensagens.

## Ativação

1. Na aplicação web, aplicar a migration `web/sql/089_projection_daily_snapshots.sql`:
   ```bash
   cd web
   node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-projection-daily.mts
   ```
2. Publicar a aplicação com o endpoint `POST /api/sales-projection/snapshots/automation`.
3. No n8n, importar `automations/n8n/projecao-parcial-diaria.json`.
4. No nó **Registrar parcial diária**, selecionar a mesma credencial **Header Auth** usada nas outras automações do sistema: `Authorization: Bearer <TASK_AUTOMATION_TOKEN>`. A chave deve corresponder à configuração da aplicação. Não inserir a chave no JSON ou no repositório.
5. Ativar/publicar o workflow no n8n. O timezone já está definido como `America/Sao_Paulo`.

O `GET` na mesma URL testa a autenticação sem gravar uma parcial. A janela de fechamento vai de 00h a 05h59 de Brasília. Fora desse intervalo, a chamada retorna `state: waiting`. A primeira chamada bem-sucedida nessa janela retorna `created`; as demais retornam `exists` com o mesmo ID. O arquivo é fornecido desativado para que a credencial seja selecionada antes da ativação.

Não é necessário atualizar o integrador para esta automação; ele continua alimentando a base nas rotinas existentes. Instalar somente a migration não ativa o agendamento: a aplicação precisa estar publicada e o workflow, ativo.

## Proteções e novas tentativas

- Uma chave única por **dia de Brasília**, com reserva do dia e criação da parcial na mesma transação, impede duplicação mesmo com chamadas simultâneas.
- A automação tenta a cada 15 minutos entre 00h e 05h45. Chamadas adicionais não alteram a fotografia já gravada.
- A integração deve estar completa e tanto as OSs quanto os dados comerciais precisam ter atualização nas últimas duas horas. Caso contrário, retorna HTTP 503 sem consumir o dia, permitindo tentar novamente.
- Se todas as tentativas falharem, o dia encerrado fica sem parcial; consultar as execuções do n8n. Não há preenchimento retroativo com os dados atuais, pois eles não representam o fechamento de dias anteriores.
- O registro se chama **Parcial automática · DD/MM/AAAA**, com autor **Automação diária**.
- A parcial permanece imutável. Se um administrador excluí-la, o controle diário permanece e não cria outra automaticamente naquele mesmo dia.
- As capturas manuais não consomem a cota diária da automação.
