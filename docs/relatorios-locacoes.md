# Relatórios de locação e empréstimo

Nova API `/api/rental-reports?kind=overdue|weekly|monthly&format=json|pdf|html`. Usa a mesma credencial Bearer `PREVENTIVE_REPORT_TOKEN` dos relatórios de preventivas; prévias PDF/HTML também aceitam administrador autenticado. Não modifica equipamentos nem dispara mensagens. Ainda é necessário publicar o código para o n8n acessá-la.

Regras:
- Somente equipamentos presentes com família 3 e situação atual Locado ou Emprestado, determinada pela mesma função usada na gestão de equipamentos.
- Cliente e OS vêm do vínculo que determina a situação atual; informa também empresa da OS, código, ID interno e série.
- Início = data de abertura da OS; fim = Data de Entrega (não prevista).
- Diário: dias restantes < 5, incluindo negativos (vencidos) e zero (hoje). Exatamente 5 dias não entra.
- Semanal: de 0 até 29 dias restantes, conforme a classificação de próximo vencimento do sistema. Inclui urgentes, mas não os já vencidos.
- Mensal: todos os locados e emprestados, incluindo contratos sem datas válidas, sinalizados para conferência.
- Contratos sem datas válidas não recebem prazo presumido e não entram nos alertas diário/semanal.

Arquivos n8n:
- `automations/n8n/locacoes-overdue.json`: segunda a sexta às 07h; sem enviar se vazio fora do teste.
- `automations/n8n/locacoes-weekly.json`: segunda às 07h.
- `automations/n8n/locacoes-monthly.json`: dia 1º às 07h.

Todos usam America/Sao_Paulo. Os horários seguem o padrão autorizado para preventivas. São workflows novos, desativados e em modo de teste; não substituem preventivas. Importar cada JSON, selecionar as mesmas credenciais do sistema, SMTP e Evolution. Caso use Bearer Auth, inserir somente o token. Configurar o endereço Evolution e `phone` com o ID real do grupo desejado; o arquivo traz o número pessoal de teste, não o grupo configurado remotamente. A chave e o ID do grupo não são armazenados no repositório.

Após teste, `testMode:false` envia aos dois destinatários Guilherme e Bruno. O nó WhatsApp começa desativado. E-mail exibe até 30 itens e PDF completo com logo; WhatsApp até 10 itens. Não há deduplicação entre reexecuções; não repetir o fluxo inteiro depois de um envio parcial. Nenhum workflow remoto foi alterado nesta implementação.
