# Portal Técnico RJ — APK 2.2.4

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
