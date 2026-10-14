# Mapa do portal técnico

Em Programação → Mapa, alterne Técnicos / OSs. A equipe inclui usuários ativos com cargo Técnico (com ou sem acento). Mostra a posição mais recente entre o compartilhamento no portal e os apontamentos, incluindo origem, horário de Brasília e precisão. Posições com mais de 20 minutos são indicadas como desatualizadas.

O botão Compartilhar minha localização solicita a permissão do navegador. Enquanto a programação permanecer aberta e a página estiver visível, registra uma posição a cada 10 minutos. Retornar à página dispara uma atualização se esse intervalo já passou. Pausar ou fechar não apaga a última posição. Não há rastreamento em segundo plano com o navegador fechado. A posição só é gravada para a identidade autenticada.

OSs são limitadas às operações enviadas ao usuário como responsável ou apoio, incluindo executadas. Todas as operações do usuário executadas: verde; alguma em execução: azul; pendência em data anterior a hoje: vermelho; demais: cinza. A data é comparada em Brasília. Usa a localidade e coordenadas da programação de serviços, validando mudanças de endereço; localidades sem coordenadas são listadas e devem ser posicionadas no mapa da programação de serviços.

Antes de publicar, execute em web: `node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-field-map.mts`. A migração 046 guarda somente a última posição de acesso de cada técnico; os apontamentos permanecem na tabela existente.
