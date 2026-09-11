# Catálogo do fabricante

A aba **Catálogo do fabricante** (`/fabricante`) permite pesquisar a planilha por descrição, código, modelo e condições de aplicação. Os filtros de modelo e série selecionam versões candidatas; o seletor de aba permite conferir uma versão específica. A pesquisa global combina palavras e ignora acentos. Os códigos podem ser pesquisados com ou sem os espaços usados na planilha.

A primeira importação de `Comparativo 2017 GA-GX Rev.11.xls` contém 49 abas de modelos e 1.830 registros, incluindo linhas sem código e notas da origem. Há 36 registros com dados a conferir e um hyperlink da seleção sem destino de catálogo válido. Essas informações são preservadas: nenhum zero inicial é inventado e nenhuma descrição é herdada de outra linha.

## Relação com o M8

Os códigos completos da planilha são relacionados a `referenciaFabricante` e `codigoSimilaridade` do cadastro `m8_product_catalog`. O vínculo informa qual campo o originou. Espaços, pontos e hífens são normalizados, preservando zeros iniciais. Campos com vários códigos separados por vírgula, ponto e vírgula, barra ou quebra de linha são separados; códigos numéricos de dez posições também são identificados como palavras completas no texto. Não há correspondência por substring de um código maior nem equivalência automática por descrição.

A listagem mostra até oito IDs de produto por código, priorizando **Referência fabricante (Genuína)** e depois código de similaridade. O limite é aplicado aos produtos antes de abrir seus cadastros por empresa; um mesmo ID ocupa um único card. O resumo exibe estoque total e disponível somados nas empresas do filtro. Com Empresa = Todas, considera 1, 2 e 27404; com uma empresa selecionada, considera apenas ela.

Os detalhes abrem os saldos, preços, referências, similaridades, fotos e histórico de cada empresa. Cadastros do mesmo ID são incluídos no saldo mesmo que uma das empresas não tenha a referência preenchida; isso é sinalizado nos detalhes. Produtos com IDs diferentes continuam separados, mesmo quando a descrição é igual. Unidades diferentes ou ausentes não são somadas. Valores ausentes/não finitos são tratados como saldo incompleto, nunca como zero; quando possível, é mostrado o subtotal conhecido. Datas de coleta antigas ou ausentes recebem aviso no resumo. Estoque, disponível, preço e preço mínimo usam as coletas existentes e exibem suas datas. Um vínculo cadastral não confirma compatibilidade técnica: conferir versão, faixa de série, pressão, tensão e demais observações antes da aplicação.

Um trigger atualiza os vínculos sempre que o integrador grava o cadastro de produtos. **Não é necessário instalar outro timer ou atualizar o pacote do servidor para esta funcionalidade.** O catálogo do fabricante só muda quando uma nova planilha é importada; não há consulta automática ao fabricante.

## Histórico ao lado do catálogo

Informe uma empresa e a série completa para consultar materiais das OS associadas. Também há atalhos no detalhe da OS e de cada equipamento. A correspondência da série é exata, ignorando pontuação, e fica restrita à empresa selecionada.

Os totais consideram OS `Processado`, com coleta de detalhes concluída e sem pendência, e materiais não excluídos com quantidade positiva e finita. Produtos e unidades são agrupados separadamente. São apresentados até 100 materiais, pelos mais recentes. Uma OS pode conter vários equipamentos: o painel mostra materiais das OS associadas, e não prova consumo exclusivo da máquina. Séries encontradas em mais de um cliente recebem aviso. Os links de histórico preservam empresa, série exata e produto, quando aplicável; a consulta de histórico continua exibindo também OS abertas e materiais excluídos, conforme seus filtros.

Regras de série inequívocas são avaliadas como candidatas; expressões ambíguas, como intervalos entre prefixos diferentes, exigem conferência. A observação de cada peça continua visível e não é convertida em garantia de aplicação. Intervalos em horas são informativos; não há cálculo de manutenção vencida sem horímetro.

## Importação e atualização da planilha

No ambiente de administração, com Node 22+, execute a partir da raiz do repositório:

```bash
npm ci --prefix web
npm run db:search --prefix web
npm run manual:import --prefix web -- '../Comparativo 2017 GA-GX Rev.11.xls' --dry-run
npm run manual:import --prefix web -- '../Comparativo 2017 GA-GX Rev.11.xls'
```

`web/.env.local` deve conter `DATABASE_URL` com acesso de escrita para as migrations/importação. O certificado TLS fica em `web/certs/supabase-ca.crt`. Não envie credenciais ao GitHub.

O importador suporta a estrutura deste comparativo (B: descrição, C: código, D: observação, E: intervalo; três seções de peças), em XLS ou XLSX. Uma planilha de outro layout exige adaptação e revisão do relatório antes da carga. Use o caminho do novo arquivo no comando para atualizar a revisão.

O modo `--dry-run` lê a planilha e grava uma cópia e o relatório em `.m8/manufacturer/`, sem alterar o banco. O relatório inclui os registros a conferir e problemas dos vínculos entre abas. A importação efetiva usa transação e trava de concorrência: ou ativa a revisão inteira ou mantém a anterior. Reimportar o mesmo arquivo não duplica registros. Reimportar uma revisão anterior a torna ativa novamente. Revisões anteriores ficam preservadas no banco; apenas uma fica ativa na consulta.

A identificação da revisão é o SHA-256 dos bytes da planilha. O arquivo original fica fora do Git e fora da pasta pública do site. Faça backup privado de `.m8/manufacturer/`; a cópia local não substitui o backup do Supabase.

## Publicação e acesso

As migrations e a primeira carga já foram aplicadas no Supabase configurado no ambiente de desenvolvimento. Para outro banco, execute os comandos acima. A publicação da interface segue o deploy Vercel existente, com Root Directory `web`.

A página e sua API `/api/manufacturer` usam a mesma autenticação e lista de e-mails autorizados do histórico. As quatro novas tabelas têm RLS e não concedem leitura aos papéis `anon` ou `authenticated`; somente o backend autenticado consulta o banco. A API não permite upload ou importação de arquivos.

## Validação

```bash
npm run typecheck --prefix web
npm test --prefix web
npm run test:browser --prefix web
npm run build --prefix web
```

Há testes de importação com zeros formatados, campos ausentes, fórmulas e erros; limites de série; correspondência por códigos múltiplos; atualização do índice por trigger; isolamento de empresa/série; exclusão de itens cancelados e coletas pendentes; autenticação e interface em desktop e celular.

## Apresentação de saldos e bloqueio do produto

O resumo mostra Estoque, sua data de coleta, Disponível, sua data de coleta e valor estimado a custo médio, sem caixas ou bordas internas. Para várias empresas, cada data é a mais antiga entre as coletas somadas; se faltar uma data, aparece “Coleta incompleta”. O valor estimado só aparece quando todos os valores necessários são conhecidos e as unidades compatíveis. As cores de disponibilidade e o alerta de estoque maior que disponível foram mantidos.

Na documentação M8 consultada, `ProdutoListResponseDto` retorna `bloqueado` (`BoleanoEnum`: `Sim`/`Nao`). O catálogo sinaliza **Bloqueado no M8** quando esse campo é `Sim`; se o bloqueio variar por empresa, identifica as empresas no resumo e nos detalhes. Os saldos continuam visíveis, pois bloqueio cadastral não implica saldo zero. A informação vem do payload já atualizado pelo integrador, sem nova migration ou instalação no Linux.

Não há campo específico documentado de ativo/inativo no estoque nem motivo de inativação/bloqueio nesse retorno ou no retorno de saldos por estabelecimento. `ativoEcommerce` controla apresentação no portal e não é usado como status de estoque. Por isso, o sistema não presume inatividade e não inventa um motivo; em produtos bloqueados, informa que o motivo não é disponibilizado pela API.

Fonte: [contrato OpenAPI M8](https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json), endpoints `/v1/estoque/produto` e `/v1/estoque/produto/{produtoId}/estoque`.

## Filtro de intervalo informado

Escolha o modelo e, quando necessário, série/versão. A lista de intervalos se atualiza para esse conjunto de versões. Selecione o intervalo e clique em Pesquisar. O filtro permanece na URL e na paginação; mudar modelo, série ou versão limpa a seleção.

As revisões incluem periodicidades que se repetem: 8.000 h inclui 2.000, 4.000 e 8.000 h, mas não 6.000 h. A revisão de 24.000 h inclui 6.000 e 8.000 h, mas não 16.000 h. Os números entre parênteses contam os itens das versões selecionadas, antes dos filtros de texto e de revisão cadastral.

Intervalos condicionais como 6.000/8.000 entram quando alguma periodicidade coincide, uma vez por linha da planilha, mantendo o aviso “Conferir condições”. Isso não confirma a aplicação de ambas as condições ao equipamento. Itens sem intervalo e anotações podem ser selecionados separadamente. Números acima de 100.000 horas são tratados conservadoramente como dados a conferir (possível código de peça na coluna), preservando o original.

O resultado lista as peças registradas no comparativo; itens sem periodicidade e condições da versão ainda precisam ser conferidos. Não substitui o plano completo de manutenção do fabricante. Não exige migration nem atualização do integrador.
