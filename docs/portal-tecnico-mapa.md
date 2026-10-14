# Mapa do portal técnico

Em Programação → Mapa, alterne Técnicos / OSs. A equipe inclui usuários ativos com cargo Técnico (com ou sem acento). Mostra a posição mais recente entre o compartilhamento no portal e os apontamentos, incluindo origem, horário de Brasília e precisão. Posições com mais de 20 minutos são indicadas como desatualizadas.

O portal solicita automaticamente a permissão de localização para usuários com cargo Técnico, sem botão de compartilhamento. Enquanto o portal permanecer aberto e a página estiver visível, registra uma posição a cada 10 minutos. Retornar à página dispara uma atualização se esse intervalo já passou. Fechar não apaga a última posição. Técnicos online aparecem em verde e offline em vermelho, conservando a última coordenada. A presença segue a administração de usuários: última atividade nos últimos 15 minutos, posterior ao último logout. Não há rastreamento em segundo plano com o navegador fechado. A posição só é gravada para a identidade autenticada.

OSs são limitadas às operações enviadas ao usuário como responsável ou apoio, incluindo executadas. Todas as operações do usuário executadas: verde; alguma em execução: azul; pendência em data anterior a hoje: vermelho; demais: cinza. A data é comparada em Brasília. Usa a localidade e coordenadas da programação de serviços, validando mudanças de endereço; localidades sem coordenadas são listadas e devem ser posicionadas no mapa da programação de serviços.

Antes de publicar, execute em web: `node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-field-map.mts`. A migração 046 guarda somente a última posição de acesso de cada técnico; os apontamentos permanecem na tabela existente.

## Foto do técnico

Na administração, edite o usuário e use Foto do usuário para enviar, substituir ou remover uma imagem. Para um cadastro novo, salve primeiro e então anexe a foto. São aceitos JPG, PNG e WebP de até 2 MB. O servidor grava uma miniatura JPEG de 256 × 256, sem metadados originais. O envio tem salvamento próprio. Apenas administradores alteram fotos; a leitura exige autenticação do próprio usuário ou acesso ao mapa (administrador/técnico). O popup usa a foto, com iniciais como alternativa. A migração 047 é aplicada por `scripts/setup-user-photos.mts`.
