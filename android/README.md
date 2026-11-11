# Portal Técnico RJ — APK 2.2.20

A versão 2.0 utiliza uma tela de entrada **nativa do Android**, a interface operacional
empacotada no APK e um banco **SQLite privado do aplicativo**. Não abre a página
remota para carregar a interface e não depende do cache do Chrome para guardar trabalho.
O servidor de autenticação e sincronização continua sendo https://rjcompressores.app.

## Funcionamento

- A interface operacional é compilada a partir dos mesmos componentes React do portal.
  HTML, JavaScript, CSS, fontes e imagens da interface são incluídos no APK.
- A entrada é uma tela Android com marca, e-mail, senha e indicador de conexão.
- **Localização precisa autorizada e localização do aparelho ligada são obrigatórias.**
  Sem elas, uma tela nativa impede o acesso e oferece atalhos para permissão e configurações.
  A condição é reavaliada ao retornar ao app e ao alterar a configuração de localização.
  GPS não é inventado quando não há sinal; os apontamentos continuam validando a coleta.
- Fotos, assinaturas, relatórios salvos, programação baixada e fila são guardados em SQLite.
  Fotos são deduplicadas por SHA-256 e as gravações usam transações: dados, projeções e
  fila são confirmados juntos. Registros grandes são divididos em linhas pequenas para
  evitar o limite do CursorWindow do Android. Uma falha de gravação não confirma sucesso.
- Os horários originais, IDs idempotentes e regras de conflito da sincronização são mantidos.
- O ícone de sincronismo abre as pendências. O ícone Sair fica ao lado e encerra a sessão
  online, preservando a fila vinculada à conta. A cópia das pendências é exportada pelo
  seletor nativo de documentos. Câmera e galeria utilizam os seletores do Android.
- O aplicativo abre a interface instalada mesmo com o servidor suspenso (HTTP 402/503).
  Dados previamente baixados permitem continuar o trabalho; novas autenticações e novos
  serviços ainda não baixados precisam do servidor disponível.
- A fila é enviada automaticamente ao voltar a conexão, ao retomar o app e a cada 30
  segundos com o aplicativo aberto. **Não há serviço permanente de sincronização em
  segundo plano nesta versão.** Se o Android suspender ou encerrar o processo, os dados
  permanecem no SQLite e o envio continua ao reabrir. Manter o app aberto até zerar a fila.
- Mapas de ruas remotos, PDFs gerados no servidor e serviços externos de voz exigem rede.
- Atualizações da interface instalada agora exigem um novo APK.

## Atualização da versão 1.x

A assinatura e o identificador `app.rjcompressores.tecnico` são mantidos, permitindo
instalar por cima da versão anterior. **Antes, sincronizar todas as pendências da 1.x**
e, se necessário, exportar sua cópia no painel Sincronismo. Os registros antigos ficam
no armazenamento do navegador e não são transferidos automaticamente para o SQLite.
Não limpar os dados do Chrome: se houver pendências antigas, abrir /tecnico no mesmo
Chrome e na mesma conta para sincronizá-las após o servidor retornar.

Na primeira entrada na versão 2.0, autorizar localização, ligar a localização, fazer
login com internet e aguardar a programação ser baixada. As credenciais de sessão
ficam nos cookies privados do WebView; a senha só é salva quando o usuário marca “Lembrar-me”, com AES-GCM e chave privada do Android Keystore. Desmarcar remove as credenciais lembradas.

Não desinstalar nem limpar os dados do aplicativo com pendências: isso apaga o banco
local. Backups automáticos Android estão desabilitados. Usar a exportação de pendências
quando necessário. Guardar o aparelho com bloqueio de tela.

## Publicação do servidor

O servidor deve conter os endpoints offline e a migração web/sql/051_offline_photo_requests.sql.
Em web, executar o script com o ambiente de produção autorizado:

~~~sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-field-offline.mts
~~~

A associação assetlinks.json não é necessária para a versão 2.0 (não é TWA).
Pode permanecer publicada para as instalações antigas. Se a hospedagem estiver suspensa,
restabelecer o servidor para permitir login, download inicial e sincronização.

## Compilar e verificar

Requisitos: Node 22+, dependências de web instaladas, JDK 17/21 e Android SDK API 36.
Configurar ANDROID_HOME ou android/local.properties. O Gradle gera automaticamente
os assets locais via web/scripts/build-native.mjs antes de compilar o APK.

~~~sh
cd android
./gradlew testDebugUnitTest assembleRelease
~~~

O APK fica em app/build/outputs/apk/release/app-release.apk. Os assets gerados ficam em
app/build/generated/portalAssets e não precisam ser versionados.

A chave privada está em android/rj-tecnico.jks e a configuração em signing.properties.
Ambos são ignorados pelo Git. Guardar cópia segura: atualizações precisam da mesma chave.
Não gerar uma chave nova para atualizar a instalação existente.

## Segurança e testes

Somente a interface instalada é carregada no WebView. A ponte para SQLite usa mensagens
restritas à origem HTTPS e ao frame principal. Navegação remota não recebe acesso à ponte;
iframes, conteúdo misto e acesso file:// ficam bloqueados. Permissões do servidor continuam
valendo, e fotos em cache são consultadas apenas para a conta local ativa.

Os testes cobrem SQLite real no Android (Robolectric), persistência de fotos grandes,
rollback de transações e isolamento por conta. A interface empacotada é testada com uma
ponte para SQLite, simulando servidor suspenso, reabertura, fotos, relatório e sincronização.
Também são executados os testes de regressão offline do portal web.
A validação final de câmera, localização e ciclo de vida em Android físico continua necessária.

### Versão 2.1.0 — localização e notificações nativas

- Os apontamentos obtêm posição pelo LocationManager do Android, inclusive offline, sem depender da autorização de geolocalização da WebView. Apenas posições recentes são aceitas; falta de sinal GPS é diferenciada de permissão negada.
- O ícone de configurações ao lado do sincronismo abre as permissões, com botão para solicitar os acessos necessários e teste de localização. O Android exige confirmações individuais. Se uma permissão foi negada permanentemente, use “Configurações do aplicativo”.
- Alertas do relatório usam diálogo nativo “Portal Técnico RJ”.
- Apontamento ativo ou pausado aparece em notificação contínua, com cronômetro e acesso à operação. A tela de bloqueio depende das preferências do aparelho.
- O limite de pausa é agendado pelo AlarmManager a partir do estado salvo em SQLite; funciona sem internet e sem depender de temporizadores JavaScript. Retomar/finalizar cancela o aviso. Reiniciar o aparelho e atualizar o APK reconstituem o agendamento.
- Autorize notificações e “Alarmes e lembretes” para avisos pontuais. Sem autorização de alarmes exatos o Android pode atrasar a entrega. Som e vibração respeitam o canal “Limite de pausa”, modo silencioso e Não Perturbe. Forçar parada do aplicativo impede alarmes até reabri-lo.
- A partir da versão 2.2.0, a localização também é atualizada em segundo plano conforme descrito abaixo. A sincronização dos registros permanece ao abrir/retomar o aplicativo.

### Versão 2.1.1 — conexão e entrada
- Login e portal consultam a rede validada pelo Android. NetworkCallback atualiza o indicador ao perder, recuperar ou trocar a rede, e dispara sincronização ao reconectar.
- Falha do servidor não significa “Sem internet”: a faixa mostra a conexão real e um aviso separado informa indisponibilidade da sincronização.
- Login nativo com marca RJ arredondada, ícones de conexão e opção “Lembrar-me”, desmarcada inicialmente. E-mail/senha são lembrados somente após autenticação bem-sucedida, criptografados com AES-GCM e chave não exportável do Android Keystore. Não são copiados para SQLite ou para backup de pendências.
- Sair encerra a sessão, mas preserva as credenciais se o usuário escolheu lembrar. Para removê-las, desmarcar “Lembrar-me” no login.

### Versão 2.1.2 — identidade visual
Logo Portal Técnico / RJ Compressores no login nativo e no ícone adaptativo Android. Fonte e instruções de geração em branding/README.md.

### Versão 2.1.3 — mapa
Corrige a política de imagens da WebView para autorizar o host exato https://tile.openstreetmap.org utilizado pelo Leaflet. O teste da interface empacotada aplica a mesma CSP do APK e verifica o carregamento das imagens do mapa. As imagens das ruas continuam exigindo internet.

### Versão 2.2.0 — programação e acompanhamento

- Serviço Android de localização iniciado com o portal aberto e mantido em segundo plano/tela bloqueada, com notificação permanente. Atualiza a posição a cada cinco minutos quando conectado e encerra ao sair da conta. Economia de bateria, ausência de sinal GPS e parada forçada podem atrasar ou impedir atualizações; reabrir o aplicativo retoma o serviço.
- Mapa mostra “Visto por último”, sem origem e datas redundantes. A abertura do portal atualiza a presença.
- Pausas mostram motivo, tempo atual e acumulado da operação; peças ficam disponíveis somente para consulta após envio do relatório. Operações encerradas podem ser exibidas na lista.
- Devolver relatório preserva respostas e fotos. Substituir o checklist exige confirmação do planejador e reinicia seu preenchimento.
- Sincronismo identifica o item em envio e alerta sobre programação não baixada no dia. Barra de conexão ocupa o topo, sem botão Sair duplicado na janela de sincronismo.
- PDFs completos/resumidos usam o mesmo gerador do sistema principal e abrem em visualizador Android. Exigem conexão, registros sincronizados e publicação do endpoint /api/field/report. Relatórios ainda não revisados são identificados como prévia.
- Término estimado respeita o calendário exibido na operação, incluindo intervalos e exceções. O calendário padrão atualmente não possui expediente na sexta-feira à tarde.
- Publicar também as alterações do servidor para preservar devoluções, confirmar substituições, atualizar presença e gerar PDFs.

### Versão 2.2.1 — relatórios e sincronização

- Localização permanece ativa com o aplicativo minimizado ou a tela bloqueada. Fechar pelo botão Fechar ou remover a tarefa da lista de recentes encerra o serviço. A notificação exigida pelo Android é silenciosa e não informa o intervalo de atualização.
- PDF no portal web funciona também sem o modo offline instalado. A aba é reservada no clique para evitar bloqueio de pop-up.
- PDF da operação contém somente seu relatório. PDF da OS utiliza o relatório unificado com linha do tempo e todas as operações daquela OS, inclusive de outros profissionais e sem checklist. O servidor verifica se o técnico tem uma operação enviada na OS; acesso a outras OSs continua negado.
- Cabeçalho do relatório permanece inteiro na rolagem, sem botão de configurações. PDF fica no rodapé junto de Salvar, Devolver e Enviar.
- Devolução com rascunho é aceita após encerrar o apontamento; respostas/fotos são preservadas. Conflitos reais de versão continuam protegidos.
- Falhas individuais não interrompem registros independentes da fila. Ações dependentes da operação com erro e apontamentos dependentes de um cronômetro anterior aguardam correção; fotos independentes podem continuar.
- Visto por último mostra minutos, horas, dias, meses e anos conforme o tempo decorrido.

### Versão 2.2.2 — identificação e portal web

- Versão do APK no rodapé da entrada nativa e da tela inicial do portal, derivada da configuração do pacote.
- Botão da OS identificado como “Gerar Relatório OS”; utiliza o gerador unificado do painel, incluindo todas as operações e a linha do tempo.
- Publicação conjunta das correções da versão 2.2.1 no portal web, incluindo Visto por último em horas/dias e a fila de sincronização.

### Versão 2.2.3 — relatórios, fotos e portal web online

- Relatórios da operação e da OS identificam o equipamento de cada operação. A seção **Tempo de paradas** considera as causas habilitadas para o relatório do cliente.
- A fila tenta todos os registros independentes; apenas dependências reais (foto usada no relatório, versão anterior ou sequência do apontamento) aguardam. Falhas de uma foto não interrompem o envio das demais.
- Notificações do apontamento incluem o cliente. Inclusões e remoções de OS são avisadas após atualizar a programação, sem avisar novamente as mesmas mudanças ou todas as OSs no primeiro acesso.
- Localização continua com o aplicativo minimizado, com a notificação silenciosa obrigatória do Android. Encerra ao fechar o aplicativo.
- Portal web funciona somente online. Registros antigos do navegador são preservados para sincronização ou exportação; novos registros e fotos vão diretamente ao servidor. O APK mantém SQLite e trabalho offline.

### Versão 2.2.4 — devolução do checklist

- Solicitação do motivo e confirmação da devolução usam diálogos nativos Android com título Portal Técnico RJ, sem o cabeçalho de página de internet.
- Texto: “Informe o motivo da devolução do checklist”.

### Versão 2.2.5 — permissões e campos obrigatórios

- Técnicos adicionais recebem as operações e podem registrar horas, mas não acessar o relatório nem finalizar a operação.
- Validação dos campos obrigatórios antes do envio, inclusive offline. Um relatório incompleto não é marcado localmente como enviado.
- Preserva os dados locais ao instalar como atualização com a mesma assinatura. Não desinstalar o aplicativo para atualizar.

### Versão 2.2.6 — apontamento com equipe

- Inclui o botão **Iniciar com equipe** na interface instalada, com seleção de integrantes de apoio da operação. O início em equipe exige conexão e não é enfileirado como um início individual offline.
- Início, pausa, retomada e encerramento acompanham os integrantes selecionados conforme as regras do servidor. Técnicos adicionais continuam sem acesso ao relatório ou à finalização da operação.
- Inclui a interface atual do portal técnico, publicada após a versão 2.2.5. Atualizar o site sozinho não atualiza os arquivos incluídos no APK.
- Mantém `app.rjcompressores.tecnico` e a assinatura existente. Instalar como atualização, sem desinstalar ou limpar os dados.

### Versão 2.2.7 — peças e devoluções

- Atualiza a interface empacotada do portal técnico com a organização das quantidades de retirada e devolução, campos alinhados e informações de disponível/registrado.
- Ajuste de devolução com quantidade inicialmente em branco quando zerada, referência da retirada e botões revisados.
- Inclui as validações atuais de reserva e o ajuste de devoluções ainda não recebidas pelo almoxarifado.
- Mantém a assinatura e o identificador existentes. Instalar como atualização, sem desinstalar ou limpar dados. O servidor deve estar atualizado para disponibilizar as regras e os endpoints correspondentes.

## Primeiro acesso — 2.2.8

A interface instalada verifica `/api/session` antes de abrir o portal quando há
conexão. Se a conta exige troca de senha, apresenta o formulário e só abre o
portal após salvar a senha pessoal. O login nativo não armazena a senha
provisória em “Lembrar-me”. Acesso offline continua usando os dados locais;
as APIs mantêm a validação da troca obrigatória no servidor.

Publicar primeiro a aplicação web com o endpoint GET `/api/session` e depois
distribuir o APK 2.2.8 (código 18). A interface é empacotada no APK, portanto a
publicação web sozinha não corrige os aplicativos já instalados. Os portais
web técnico e vendedor já encaminham contas marcadas com
`app_metadata.must_change_password=true` para `/alterar-senha`.

## Execução e devoluções — 2.2.9

A versão 2.2.9 (código 19) exige foto e identificação do item nos NOK,
impede envio do relatório com apontamento aberto e novos apontamentos após o envio.
Devoluções de peças continuam disponíveis após envio/finalização, preservando a retirada.
O projetor offline aplica as mesmas regras; o servidor revalida ao sincronizar.
A publicação web requer `093_service_execution_workflow.sql` antes da distribuição.

O pacote 2.2.9 também apresenta os B.Os do equipamento em Informações da operação, com data e acesso ao texto completo. Requer a migração web 094; veja `docs/bo-equipamentos.md`.

Download da versão 2.2.9: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.9

Inclui o botão Registrar B.O no menu da operação. O equipamento é obtido da programação, dos vínculos válidos ou do equipamento informado diretamente na OS, como no caso da OS 15211.

## Fotos obrigatórias — 2.2.10

Versão 2.2.10 (código 20): o botão e o ícone de adicionar fotos ficam vermelhos quando falta a foto obrigatória de um item NOK. O destaque desaparece após anexar a foto ou alterar a resposta para uma opção que não exige foto. A alteração exige atualizar o APK, pois a interface é empacotada. Preserva assinatura e dados do aplicativo.

Download: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.10

## Renderização do checklist — 2.2.11

A versão 2.2.11 (código 21) corrige as chaves dos elementos dos grupos na renderização do checklist, eliminando o aviso do React ao atualizar ou retornar o relatório. Preserva o rascunho, as respostas e os identificadores dos campos. Mantém a assinatura existente.

Download: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.11

## Mapa da equipe — 2.2.12

Versão 2.2.12 (código 22): técnicos próximos ficam agrupados na visão afastada. Ao aproximar, as pessoas no mesmo local se distribuem em círculo compacto, com linhas tracejadas até o ponto original e nomes voltados para fora. Mantém a assinatura e os dados locais da instalação anterior.

Download: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.12

## Versão 2.2.13 — rascunho do relatório técnico

Cada alteração de resposta, comentário, referência de foto já carregada e horímetro
é preservada imediatamente no armazenamento privado do WebView, separada por conta,
operação e etapa. Ao reabrir, o relatório recupera o rascunho compatível com a versão
salva. Se o servidor também mudou, oferece recuperação explícita para evitar
sobrescrever alterações de outro usuário. Falhas no armazenamento são exibidas.

Ao trocar de grupo ou etapa, o portal técnico salva automaticamente as etapas
alteradas pelo fluxo existente de `report_save`, incluindo a fila offline do APK.
Antes de abrir câmera/galeria, também reforça a persistência local. O salvamento
não envia nem conclui o relatório e mantém as validações do envio. Uma foto ainda
não capturada ou carregada precisa ser tirada novamente se o Android encerrar o app.

Verificação: teste de persistência e isolamento, teste de navegador de troca de
grupos/versão/recuperação/conflito e testes Android. Não reproduzido o encerramento
original em aparelho físico; a mudança protege os dados já preenchidos.

## Versão 2.2.14 — sincronização

O indicador distingue internet disponível de acesso ao sistema. Falhas temporárias
são tentadas novamente a partir de 2 segundos, aumentando até 30 segundos. O envio
de apontamentos novos recebe prioridade sobre downloads restantes da programação.
Uma verificação sem pendências consulta a lista de OSs, sem baixar todas as operações.
A consulta de status usa somente metadados da fila, sem carregar os bytes das fotos.
O envio continua usando confirmação do servidor, recibos idempotentes e SQLite.

Comparação e limites: `docs/comparacao-sincronismo-apks.md`. Não foi adicionado
serviço permanente para sincronizar com o aplicativo fechado.

A versão 2.2.14 também abre o card de assinatura em tela cheia. A barra inferior
tem Limpar, Salvar e Cancelar, com confirmação antes da limpeza irreversível
do campo. Cancelar mantém a assinatura previamente salva. A área de desenho
acompanha a rotação do telefone e preserva os traços durante o redimensionamento.
Falhas no envio mantêm a assinatura na tela para tentar novamente.


## Versão 2.2.15 — relatório e sincronização

- Salvar permanece visível: vermelho com alterações pendentes e cinza após salvar. Enviar só é habilitado com os campos obrigatórios preenchidos e o relatório salvo.
- Recuperação automática do rascunho do aparelho, sem confirmação ou avisos de recuperação. Alterações locais são reaplicadas preservando atualizações de outros campos no servidor.
- Salvamento automático em segundo plano permite continuar preenchendo. O envio encerra o apontamento ativo e abre a conferência de devolução de materiais para finalizar a operação.
- Falhas definitivas da fila não bloqueiam registros independentes nem novas OSs. O painel permite excluir uma pendência com falha, mediante confirmação, preservando cópia para exportação.
- Mantém o identificador e a assinatura existentes. Instalar como atualização, sem desinstalar nem limpar os dados.


## Versão 2.2.16 — mapa da equipe e encerramento

A atualização das posições renova os marcadores sem recriar o mapa ou alterar o
zoom e a posição escolhidos. O enquadramento automático ocorre na primeira carga
ou na troca explícita entre Técnicos e OSs. Clicar em um agrupamento avança até o
primeiro nível em que ele se divide; os grupos remanescentes podem ser abertos
sucessivamente. Técnicos no mesmo ponto abrem diretamente em posições individuais
com seus nomes. O módulo Registrar B.O fica após Relatório e antes de Finalizar
Operação. Correções, inclusão e replicação de apontamentos pelo técnico ficam
indisponíveis após o envio do relatório ou a finalização. Peças ficam somente para
consulta após finalizar a operação; devoluções devem ser registradas antes disso.
A conferência de devolução após enviar o relatório continua disponível enquanto a
operação ainda não foi finalizada. Mantém assinatura, identificador e dados da
instalação anterior. Os bloqueios são revalidados pelo servidor e pela projeção
offline; publicar também o backend para proteger requisições de APKs anteriores.

Download: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.16

## Versão 2.2.17 — farol das pendências obrigatórias

Os faróis dos grupos, etapas e cartão Relatório ficam vermelhos quando faltar foto ou comentário obrigatório de um item NOK, mesmo quando todas as respostas estiverem preenchidas. Alertas configurados também consideram seus comentários obrigatórios. A indicação usa a mesma validação do envio e volta ao estado de preenchimento normal quando a pendência é atendida. Fotos de outros campos não satisfazem a exigência do item. Mantém assinatura, identificador e dados da instalação anterior; instalar como atualização, sem desinstalar.

Download: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.17

## Versão 2.2.18 — reprocessamento de pendências

O painel Sincronismo permite reprocessar individualmente um registro com falha, inclusive quando a tentativa automática o marcou como falha permanente. A tentativa preserva os dados, os identificadores e a validação de versão. Os dependentes são liberados somente após a confirmação do servidor; se o erro persistir, continuam protegidos e o motivo é atualizado. Registros cujo antecessor foi excluído continuam bloqueados para conferência. Mantém assinatura e identificador: instalar por cima da versão existente, sem desinstalar nem limpar dados.

Download: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.18

## Versão 2.2.19 — recuperação do sincronismo e horímetro sem equipamento

O reprocessamento individual aguarda uma sincronização automática em andamento, sem rejeitar o clique. Falhas temporárias antigas são tentadas novamente. Apontamentos respeitam a sequência do técnico entre operações e fotos aguardam o início da atividade correspondente. Uma falha na consulta de conexão não substitui o motivo de erro do registro.

Sem equipamento explicitamente vinculado à operação, o horímetro permanece somente no relatório: não gera coleta nem atualiza equipamento ou preventiva. Essa condição aparece como alerta na revisão e é registrada no histórico da revisão. As demais validações obrigatórias continuam valendo. Instalar como atualização, sem desinstalar ou limpar dados.

Download: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.19

## Versão 2.2.20 — reenvio após falta de internet

A sincronização de relatórios e apontamentos offline não exige que a versão da programação continue igual à versão baixada antes da perda de internet. O servidor aplica o registro à operação atual, mantendo a programação atual, os horários capturados, a sequência dos registros e os recibos contra duplicidade. Pendências antigas marcadas com o erro de alteração da operação são tentadas novamente. As validações de acesso, existência da operação e regras do relatório continuam sendo verificadas. Instalar como atualização, sem desinstalar nem limpar dados.

Download: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.20

## Versão 2.2.21 — envio e encerramento por técnico

Enviar o relatório salva e envia as informações sem encerrar a atividade. O técnico decide quando encerrar sua participação, com aviso de bloqueio de novos apontamentos e conferência de devolução de peças. O encerramento fecha sua atividade e retira a operação da lista padrão do seu aparelho. A revisão pelo planejador aguarda o encerramento de todos os técnicos atribuídos. A programação identifica o envio parcial, quem já encerrou e quem está pendente. O auxiliar recebe a identificação do responsável ao abrir Relatório. O mesmo fluxo funciona offline e é confirmado na sincronização.

Instalar como atualização, sem desinstalar nem limpar os dados do aplicativo.

Download: https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/portal-tecnico-rj-v2.2.21

## Versão 2.2.22 — informações e alertas do equipamento

A tela Informações exibe Alertas do Equipamento e B.Os do Equipamento recolhidos, com contadores, e mantém as observações internas visíveis. O alerta de garantia informa a OS anterior e o prazo de cobertura, acompanhando os dados baixados da operação para consulta offline.

Instalar como atualização, sem desinstalar nem limpar os dados do aplicativo.
