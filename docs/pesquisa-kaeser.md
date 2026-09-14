# Pesquisa de manuais Kaeser

Levantamento de 13/09/2026, restrito à Kaeser. Pesquisa documental; nenhum item novo foi ativado no catálogo.

## Base consultada

O cadastro compartilhado possui 105 registros com marca Kaeser, dos quais 6 estão sem série identificada. Isso representa registros, não necessariamente 105 máquinas distintas: há descrições repetidas e identificações que precisam de conferência. O modelo frequentemente está na descrição, com o campo próprio vazio.

O inventário individual foi preservado localmente em `.m8/manufacturer-research/kaeser/equipamentos-para-conferencia.csv`. Os dados das máquinas e os PDFs não foram adicionados ao Git.

## Documentos encontrados

São documentos de autoria Kaeser hospedados na biblioteca da Best-Aire. A hospedagem não comprova aplicabilidade à máquina cadastrada.

| Documento | Identificação | Resultado da conferência |
|---|---|---|
| [BSD](https://best-aire.com/wp-content/uploads/2021/09/BSD-User-Manual.pdf) | 9_5708 08 USE; 146 páginas | Seção 11.5, páginas 100–103 do PDF. A legenda utiliza posições do desenho; exige identificação da máquina para pedir peças. |
| [ASD T Tri-Voltage](https://best-aire.com/wp-content/uploads/2021/09/ASD-T-Tri-Voltage-User-Manual.pdf) | 9_5721 06 USE; 138 páginas | Seção 11.5, páginas 97–98 do PDF. Mesma distinção entre posição e código de compra. Sufixo T e configuração elétrica precisam corresponder. |
| [AIRCENTER SK Tri-Voltage](https://best-aire.com/wp-content/uploads/2021/09/Aircenter-SK-Tri-Voltage-User-Manual.pdf) | 9_9469 13 USE; 180 páginas | Manual candidato para identificação; não aplicar automaticamente aos SK sem AIRCENTER. |
| [AS30](https://best-aire.com/wp-content/uploads/2021/09/AS30-User-Manual.pdf) | 75 páginas, digitalizado | Capa identifica AS30/35 e 428.529.1. Precisa conferir edição e conteúdo por imagem. |
| [AS30 / AS35](https://best-aire.com/wp-content/uploads/2021/09/AS-30-AS-35-User-Manual.pdf) | 75 páginas, digitalizado | Segundo arquivo candidato; não contabilizado como cobertura adicional de máquinas. |

Os cinco arquivos foram baixados, com URL e SHA-256 registrados em `.m8/manufacturer-research/kaeser/sources.json`.

Também foi localizado um [manual CSD75](https://www.manualslib.com/manual/1312703/Kaeser-Csd-75.html), ainda pendente de conferência da seção de peças e compatibilidade. Para DSD, secadores e demais famílias, esta rodada não estabeleceu documentação suficiente para cadastrar recomendações.

## Por que ainda não importar as referências

Na legenda BSD, por exemplo, 1200 identifica filtro de óleo e 1250 identifica filtro de ar. São posições da ilustração, não referências comerciais verificadas. Importá-las como códigos genuínos geraria cruzamentos incorretos com os produtos do ERP.

A [orientação oficial Kaeser](https://us.kaeser.com/compressed-air-resources/questions.aspx) solicita EMR ou identificação por número de peça e série para determinar o manual correto. O [formulário brasileiro de peças e manuais](https://br.kaeser.com/servicos/servico-ao-cliente/pecas-consumiveis-e-de-reposicao/service-request.aspx) também pede a identificação da máquina. Não foi enviada solicitação externa.

Não foi encontrado campo EMR explícito no retorno do cadastro consultado. Séries extraídas das descrições, especialmente identificadores compostos, precisam de confirmação antes de definir faixas de aplicação.

## Critérios para avançar ao catálogo

1. Confirmar máquina, edição e configuração do manual: modelo, sufixos, identificação e série.
2. Obter a referência comercial genuína de cada peça, com página e fonte; não usar posição do desenho.
3. Conferir intervalo e condições de manutenção na mesma documentação aplicável. Não transferir intervalos entre famílias.
4. Cruzar as referências confirmadas com referência fabricante e similaridade do M8.
5. Importar somente registros com esses dados completos. As demais fontes permanecem candidatas, fora das recomendações dos orçamentos.

Resultado desta rodada: cinco arquivos preservados para conferência, inventário Kaeser separado e nenhuma referência liberada sem comprovação da aplicação.
