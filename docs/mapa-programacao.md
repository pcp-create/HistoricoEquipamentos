# Mapa da programação de OSs

Na Programação de OSs, selecione **Mapa**. A visão respeita a busca por OS/cliente/equipamento e o filtro de executante, além dos filtros próprios de data das operações e status. Marcadores individuais são círculos; grupos mostram a quantidade de OSs em círculos maiores, com as mesmas cores dos status da programação. Ao afastar o mapa, pontos próximos se agrupam; ao aproximar, se separam. Clicar em um grupo de posições distintas aproxima o mapa. OSs na mesma coordenada permanecem juntas, e o clique abre seus detalhes e links para a programação. Grupos com status diferentes exibem setores coloridos com a quantidade de OSs de cada status dentro de sua cor, mantendo as cores da programação. Grupos de um único status mostram o total no centro. O agrupamento é calculado no navegador e não consulta a API de localização. O mapa traz à direita um resumo do total de OSs por status, respeitando os filtros e incluindo OSs ainda sem coordenadas; no celular, o resumo fica abaixo do mapa. O ícone de localização com lápis ao lado do endereço no balão de cada OS permite ajustar sua posição e selecionar outra localidade quando disponível. OSs sem endereço ou coordenadas ficam na seção recolhida abaixo do mapa.

As localidades vêm exclusivamente de `m8_customer_localities`, empresa 1, inclusive para OSs das demais empresas. Prioridade: escolha explícita do planejador, endereço de entrega informado na OS, endereço de entrega único do cliente, endereço padrão único, única localidade disponível. Havendo ambiguidade, o planejador precisa selecionar. Um endereço explícito de entrega ainda não coletado não é substituído silenciosamente.

## Coordenadas

O endpoint do ERP não fornece latitude/longitude. O planejador pode usar **Marcar no mapa**, clicar no ponto ou preencher as coordenadas e confirmar **Salvar posição**. A posição é persistida em `web_customer_map_points`, por `person_id` e `address_id`, e reutilizada pelas OSs do mesmo endereço. Essa tabela complementa as localidades do ERP e preserva os ajustes manuais durante a sincronização; o futuro cadastro do cliente pode editar a mesma posição. Endereços já localizados não exigem nova consulta ao provedor. Alterações no endereço do ERP invalidam automaticamente as coordenadas anteriores. Essa ação não modifica o ERP.

Ao abrir o mapa, a busca automática usa Geoapify quando `GEOAPIFY_API_KEY` estiver configurada no ambiente do servidor web (Vercel e desenvolvimento). Consulta sequencialmente somente as localidades selecionadas das OSs visíveis que ainda não têm coordenadas. Endereços compartilhados não geram consultas duplicadas. Falhas não são repetidas automaticamente enquanto o mapa permanecer aberto; o botão **Localizar endereço** permite uma nova tentativa manual. Nunca use prefixo `NEXT_PUBLIC_` nessa chave. Somente o endereço é enviado, sem cliente, CNPJ, número da OS, nomes dos técnicos ou observações. A busca tenta endereço completo, rua simplificada sem número, CEP e município, nessa ordem. Mantém a melhor precisão retornada e exige país, UF e município compatíveis (ou CEP exato quando o provedor não informa município). Rua, bairro, CEP e referência municipal ficam explicitamente identificados como aproximações; a referência municipal não representa o endereço exato do cliente. Quando nenhuma alternativa é compatível, exige marcação manual. Coordenadas ficam armazenadas no banco, sem consultar novamente a cada abertura do mapa.

Crie o projeto e obtenha a chave no [Geoapify](https://myprojects.geoapify.com/), configure a variável no ambiente web e publique novamente. A chave não é distribuída ao navegador e não integra o pacote Linux do coletor. Esta implementação não usa o geocodificador público Nominatim.

## Instalação

A atualização do integrador de localidades precisa estar instalada. Para preparar o banco do mapa:

```bash
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-schedule-map.mts
```

O script aplica somente `040_schedule_map.sql`, com controle de checksum. Após configurar a chave, publique o frontend/API com as novas dependências do lockfile. O modo de marcação manual funciona sem a chave.

O mapa usa Leaflet e tiles OpenStreetMap com atribuição visível e cache normal do navegador, carregando apenas a área visualizada. As imagens usam `referrerPolicy: "origin"` para enviar a origem exigida pelo provedor mesmo com a política global `same-origin`, sem transmitir caminhos ou parâmetros da programação. `NEXT_PUBLIC_MAP_TILE_URL` permite configurar outro servidor compatível XYZ; sua atribuição/licença também deve ser ajustada se necessário. Não há pré-carregamento nem download offline.

Referências: [Leaflet](https://leafletjs.com/reference.html), [Geoapify](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/), [uso dos tiles OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).

### Divisão comercial

Ative **Divisão comercial** no painel direito para colorir os limites municipais conforme o campo vendedor do cadastro de divisões. Municípios sem vendedor ficam cinza. A legenda mostra a quantidade de municípios e o seletor permite destacar um vendedor. A camada comercial independe dos filtros de status/data das OSs; os marcadores continuam seguindo seus status. Limites não encontrados são listados explicitamente.

Fonte cartográfica: [Geodata BR](https://github.com/tbrugz/geodata-br), derivada do IBGE, licença CC0. É uma base histórica e pode não conter municípios criados posteriormente. A API direta do IBGE rejeitou as consultas durante a implementação. A malha pública por UF fica em cache por sete dias; o vínculo comercial é lido do cadastro a cada carregamento da camada. Nenhum nome de vendedor ou dado de cliente é enviado à fonte cartográfica. A camada é carregada somente quando ativada. Não utiliza a chave Geoapify.

Clique em um município para alterar seu vendedor no painel lateral direito. A gravação atualiza somente o campo vendedor da divisão cadastrada, preserva o orçamentista responsável, verifica a versão e registra auditoria. As divisas têm espessura de 0,4 px no zoom distante e 0,7 px ao aproximar.
