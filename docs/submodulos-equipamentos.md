# Gestão de Equipamentos

A etapa atual separa as ferramentas internas em três submódulos:

- **Controle de Preventivas** (`/equipamentos/preventivas`): planos, vencimentos, próximas intervenções e relatórios preventivos.
- **Controle de locação** (`/equipamentos/locacao`): abre na frota de locação e permite consultar locados/emprestados, disponibilidade, contratos e revisão em oficina.
- **Cliente / Equipamento** (`/equipamentos/clientes`): painel gerencial por cliente com faróis, agenda de programações, previsões preventivas, OSs pendentes e impressão do painel. Exibe operações executadas/revisadas e links para PDF resumido somente quando o checklist final está disponível.

Todos reutilizam a base e as APIs internas existentes. `/equipamentos` continua funcionando para links anteriores e acessos diretos a equipamentos/planos. A nova navegação não concede acesso externo nem altera permissões.

## Próxima etapa: portal do cliente

Escopo confirmado para implementação posterior, sem ativação nesta entrega:

1. Cadastro administrativo de perfis de cliente, com usuário autenticado por login/senha e uma lista explícita dos IDs de cliente autorizados. Utilizar o provedor de autenticação, sem armazenar senhas em tabelas de perfil.
2. Autorizar em cada consulta no servidor o equipamento solicitado pelos vínculos com os IDs configurados no perfil. Aplicar essa regra a OSs, arquivos, preventivas e oficina, inclusive acessos diretos. Revogação de perfil/vínculo deve interromper o acesso.
3. Criar APIs e telas externas próprias que retornem apenas campos permitidos. A API interna de gestão não deve ser usada como API do cliente.
4. Exibir máquinas autorizadas, OSs abertas, próximas preventivas e revisões em andamento. Restringir a oficina inicialmente aos status **Aguardando aprovação do cliente** e **Em execução**; confirmar antes da implementação se os demais status devem ser ocultados ou convertidos em uma mensagem pública. Não expor notas internas, custos ou aprovações internas da frota.
5. Permitir configurar quais contatos do cliente recebem avisos de preventivas, reutilizando os telefones cadastrados em Visitas (`web_customer_contacts`). A vinculação do contato deve respeitar o mesmo ID de cliente.
6. Configurar antecedência, frequência, consentimento/ativação, destino e deduplicação dos avisos pelo BOT. Registrar entregas e falhas, e cancelar avisos quando houver manutenção, revogação ou desativação do contato. A antecedência e a política de envio serão definidas na etapa do BOT.

Não há criação de usuários externos nem envio de mensagens ao cliente nesta etapa.

## Faróis do painel gerencial

- Azul: máquina em oficina (prioridade visual sobre os demais indicadores).
- Vermelho: preventiva vencida ou limite atingido.
- Amarelo: preventiva nos próximos 30 dias ou OS pendente.
- Cinza: plano ausente, previsão incompleta/inconsistente ou situação desconhecida.
- Verde: preventiva em dia, sem pendências identificadas. Não representa telemetria nem certificação do funcionamento da máquina.

O endpoint `/api/customer-fleet` é interno e exige autenticação existente. A seleção de cliente ainda não equivale à autorização externa por perfil. As programações e OSs são filtradas também pelo ID do cliente da OS, além do equipamento. Status de oficina além de aprovação do cliente e execução são apresentados como acompanhamento na oficina. O PDF usa o relatório resumido já existente; a política de campos e anexos externos deverá ser revisada antes de liberar o portal a clientes.
