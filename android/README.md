# Portal Técnico RJ — APK e operação offline

O APK utiliza uma Trusted Web Activity e abre **https://rjcompressores.app/tecnico**.
A interface é o mesmo componente do portal, incluindo câmera/galeria, assinatura,
horímetro, materiais, calendário e operações. Não há uma segunda interface para manter.

O aplicativo abre exclusivamente a entrada do Portal Técnico. Sem sessão, apresenta
a tela própria em /tecnico/entrar; após entrar, permanece em /tecnico.
O menu do portal não oferece acesso aos módulos do sistema de gestão.
O ícone de atualização no cabeçalho abre o painel de sincronismo, sem botão separado.
A versão 1.1.1 usa a mesma chave e identificador, permitindo atualizar a instalação
anterior sem limpar os registros offline. Publicar o portal atualizado junto com o APK.

## Publicação necessária antes de instalar

1. Aplicar web/sql/051_offline_photo_requests.sql ao banco. Em web, executar:
   node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-field-offline.mts
2. Publicar o backend e o portal deste commit. O build em web também gera
   public/field-offline/assets.json; esse arquivo e .well-known/assetlinks.json
   devem ser incluídos na publicação.
3. Confirmar HTTPS no domínio e resposta 200, sem redirecionamento, em
   /.well-known/assetlinks.json. O certificado listado deve coincidir com o APK.
4. Instalar o APK assinado. Manter Chrome (ou navegador compatível com TWA) atualizado.
   Sem a associação de domínio validada, o navegador mostra sua barra de endereço.
5. Fazer login com internet e esperar a confirmação de “Programação baixada”.
   A primeira entrada e a preparação do dispositivo exigem internet.

## Uso do técnico

- O topo mostra Conectado (verde) ou Sem internet (vermelho), com pendências.
- A preparação baixa as operações enviadas, os checklists, fotos existentes,
  referência do horímetro e a interface necessária para reabrir sem internet.
- Os apontamentos são gravados primeiro no dispositivo. Fotos e assinaturas
  são comprimidas pelo mesmo processo do portal e entram na fila.
- **Salvar** o relatório persiste as respostas e inclui o relatório na fila.
  Texto ainda não salvo continua sendo rascunho da tela.
- Ao recuperar conexão, a fila envia fotos e ações na ordem em que ocorreram.
  A tela Sincronismo permite tentar novamente, atualizar a programação e baixar
  uma cópia de segurança das pendências com as fotos.
- Registros só saem da fila depois da confirmação do servidor. Falha de rede,
  sessão expirada e conflito não apagam o trabalho.
- A sincronização usa Background Sync quando disponível, e também ocorre ao
  abrir/retomar o aplicativo, ao voltar a conexão e a cada 30 segundos com ele aberto.
  Android/Chrome podem adiar execução em segundo plano por economia de bateria ou
  encerramento forçado. Para confirmação imediata, manter o app aberto até zerar a fila.
- Não limpar os dados do navegador/aplicativo com registros pendentes.

## Integridade e limites

O servidor mantém todas as verificações de usuário, operação enviada, peças,
atividade em andamento e validação do checklist. Horários originais são preservados
nos apontamentos; a localização continua sendo obtida do GPS. Não se fabrica GPS
quando o aparelho não fornece uma posição.

IDs de requisição tornam ações e fotos idempotentes. Uma sequência offline referencia
a versão anterior confirmada pelo servidor. Alterações feitas por outro usuário ou
aparelho interrompem a fila para conferência; não há sobrescrita automática. O técnico
pode exportar as pendências para apoio do planejamento. Horários mais de 5 minutos
no futuro ou anteriores a 30 dias são recusados para revisão.

O primeiro acesso, autenticação renovada, novas operações ainda não baixadas,
mapas de ruas remotos, consulta em tempo real de outros técnicos, PDF gerado no
servidor e serviços externos de reconhecimento de voz precisam de conexão.
O calendário e os dados de programação baixados continuam disponíveis.
GPS depende da permissão e do sinal do aparelho, inclusive sem internet.

Os dados offline ficam separados por conta. Logout/login suspende o acesso à conta
local anterior. Pendências antigas somente são enviadas após autenticar a mesma conta.

## Compilar novamente

Requisitos: JDK 17 ou 21, Android SDK API 36 e Build Tools 35.0.0/36.0.0.

~~~sh
cd android
# Configure ANDROID_HOME ou local.properties (sdk.dir=...).
./gradlew assembleRelease
~~~

O resultado fica em app/build/outputs/apk/release/app-release.apk.
Sem signing.properties, o build release não será assinado.

A chave desta instalação é privada e fica em android/rj-tecnico.jks, com a
configuração em android/signing.properties. Ambos estão ignorados pelo Git.
**Guardar uma cópia segura desses dois arquivos:** atualizações do mesmo aplicativo
precisam da mesma chave. Não gerar uma nova chave para uma atualização.

Para um aplicativo novo, em uma cópia sem chave/certificado existente:
python3 scripts/create-signing.py cria a chave e o arquivo público de associação.
Ao publicar pela Play Store com Play App Signing, acrescentar o fingerprint do
certificado de assinatura da Play ao assetlinks.json.

Referências:
- https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities
- https://developer.chrome.com/docs/android/trusted-web-activity/offline-first
- https://developer.chrome.com/docs/workbox/retrying-requests-when-back-online

## Validação desta implementação

APK release compilado e assinatura verificada com apksigner. Build de produção
do portal e TypeScript aprovados. Testes automatizados cobrem captura offline,
fechar/reabrir, fotos, relatório, horários originais, reenvio após perda da resposta,
conflitos, separação por conta e fluxo da interface em viewport móvel.
A reabertura offline também foi validada com o build de produção do portal.
O envio de fotos não bloqueia a gravação de novos apontamentos no dispositivo.
A instalação e o comportamento em um Android físico ainda precisam ser validados
após a publicação do backend/portal e a associação de domínio.
