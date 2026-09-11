# Consulta de histórico

Aplicação Next.js em `web/`, independente do runner Node.js na raiz. Consulta somente o Supabase e não faz chamadas de negócio à API M8. A interface segue a referência visual azul/branca, com uma tabela alternável entre ordens e materiais.

Prévias visuais com dados fictícios usados somente nos testes: [desktop](../docs/preview/historico-desktop.png), [celular](../docs/preview/historico-mobile.png) e [login](../docs/preview/login.png).

## Funcionalidades

- Login individual por e-mail/senha do Supabase Auth. Somente contas confirmadas e incluídas em `WEB_ALLOWED_EMAILS` entram; não há cadastro público no site.
- Pesquisa global após 500 ms sem digitação ou ao pressionar Enter/Pesquisar. Ignora caixa e acentos; todas as palavras precisam aparecer, podendo estar em campos diferentes da mesma OS. Até 200 caracteres e 12 palavras.
- Todas as colunas relacionais de OS, produtos ativos e excluídos e equipamentos entram na pesquisa, incluindo campos não exibidos na tabela. O JSON bruto de auditoria `payload` não é indexado. Os campos estão acessíveis nos detalhes. O filtro de período usa emissão, com abertura como alternativa, no fuso de Brasília.
- Na visão por OS, um material correspondente retorna a ordem inteira; na visão por material, a pesquisa do produto corresponde ao próprio item, enquanto campos da OS/equipamento se aplicam aos seus materiais.
- Filtros por empresa, cliente/CPF/CNPJ, equipamento, modelo, série, material/referência, status e período. Paginação de 25/50/100 registros; filtros preservados na URL.
- Detalhes da OS, materiais e equipamentos, incluindo indicação explícita de detalhes ainda não importados.
- CSV da consulta completa, até 20 mil registros por exportação. Acima disso, pede refinamento. Campos escapados, proteção contra fórmulas e BOM UTF-8 para Excel.
- Layout responsivo, tabela com rolagem horizontal em telas pequenas, diálogo acessível com Escape, estados de erro/vazio/carregamento e atalho Ctrl/Cmd+K.

## Rodar localmente

```bash
cd web
npm ci
cp .env.example .env.local
# Preencher o arquivo privado.
npm run db:search
npm run dev
```

Nesta sessão `.env.local` já foi preparado com a conexão existente e o e-mail autorizado informado pelo usuário. Não sobrescrevê-lo com o exemplo. O certificado público CA está em `certs/supabase-ca.crt`, incluído no pacote servidor. `DATABASE_SSL_CA_FILE` não é necessário no site: ele usa esse caminho fixo para permitir empacotamento seguro na Vercel.

`npm run db:search` aplica as migrations próprias do site, com checksum e transação. As três migrations foram aplicadas ao Supabase em 11/09/2026. A terceira inclui os materiais excluídos no índice histórico. Elas criam uma projeção de pesquisa com índice trigram e triggers nas tabelas de OS, produtos e equipamentos. O runner já instalado alimenta o índice automaticamente, sem precisar de uma nova versão. As tabelas internas têm RLS e não são liberadas a `anon`/`authenticated`. As migrations não modificam os arquivos 001–005 do integrador.

A API usa conexões limitadas a três por instância, TLS verificado, consultas parametrizadas, timeout de 25 segundos por SQL e modo de transação padrão somente leitura. A migration usa uma conexão própria de escrita. Sessões ficam em cookies HttpOnly e Secure em produção; a identidade e a lista de acesso são verificadas em todas as rotas de dados, inclusive exportação e detalhes.

A prévia local também funciona em `http://127.0.0.1:3000` e `http://localhost:3000`, inclusive com `npm start`. Somente nesses endereços de loopback o cookie pode usar HTTP; nos endereços remotos o acesso e o cookie exigem HTTPS. Essa regra vale tanto para o login quanto para a renovação da sessão.

## Primeiro acesso

O e-mail autorizado inicial é `guih.waltrick@gmail.com`. Autorizar na configuração não cria uma conta de autenticação.

O usuário confirmou a criação da conta e o acesso ao site local. O provedor de e-mail está ativo. A publicação na Vercel ainda precisa ser configurada.

1. No projeto Supabase, abrir **Authentication → Users** e criar uma conta por e-mail/senha em **Add user**. Usar uma conta confirmada; definir a senha diretamente no painel, sem enviá-la ao chat.
2. Se o e-mail já tiver conta nesse projeto, usar a conta existente. O site não oferece fluxo de convite ou redefinição de senha nesta versão; o administrador faz a gestão no Supabase.
3. Manter o provedor de e-mail/senha ativo. A lista `WEB_ALLOWED_EMAILS`, separada por vírgulas, controla quem pode consultar o histórico, mesmo que o Supabase permita outros cadastros.
4. Os usuários autorizados têm acesso de consulta às três empresas. Não há divisão de permissões por empresa nesta primeira versão.

Referência: [gerenciamento de usuários no Supabase](https://supabase.com/docs/guides/auth/managing-user-data).

## Publicar na Vercel

O projeto Vercel existente pode servir esta aplicação. O runner permanece no servidor Linux.

1. Disponibilizar os arquivos no repositório conectado ao projeto Vercel.
2. Configurar **Root Directory** como `web`, framework **Next.js**, instalação `npm ci` e build `npm run build`. Usar Node.js 22 ou superior. Não apontar o build para a raiz do integrador.
3. Adicionar as variáveis servidor `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `WEB_ALLOWED_EMAILS`. A URL de banco deve usar as mesmas credenciais validadas e não incluir opções `ssl` na query string; o certificado do pacote configura o TLS.
4. Configurar `WEB_ALLOWED_EMAILS=guih.waltrick@gmail.com` inicialmente, inclusive no ambiente de preview que será testado. Nunca usar prefixo `NEXT_PUBLIC` na conexão de banco. O site não precisa das credenciais M8.
5. Gerar um deployment e verificar login, busca, detalhes e exportação com a conta real.

Não foi feito deployment nesta sessão: não há credenciais de publicação Vercel disponíveis. A conta e o acesso local já foram confirmados pelo usuário. Referência: [configuração do build e Root Directory na Vercel](https://vercel.com/docs/builds/configure-a-build).

## Verificação

```bash
npm run typecheck
npm test
npx playwright install --with-deps chromium
npx playwright test
npm run build
```

Os testes de banco executam as migrations em PostgreSQL embarcado e validam pesquisa entre colunas, acentos, parâmetros, isolamento por empresa, datas de Brasília, produtos excluídos e atualização automática do índice. Os testes de navegador verificam acesso sem sessão, navegação, filtros, detalhes, exportação e celular. Dados fictícios ficam somente nas interceptações do teste de navegador; a aplicação não tem modo de demonstração nem bypass de autenticação.

Medições reais após o índice: `filtro` retornou 1.455 OS em aproximadamente 1,6 s; `filtro oleo`, 1.007 OS em 0,24 s. São amostras da base ainda em importação, não garantia de latência. Os totais mudam conforme o runner avança. A consulta do painel não inicia uma nova coleta da M8.

## Análise de materiais

A aba `/analise-materiais` consulta materiais de OS `Processado`, com `finalized=true` e `pending=false`. Não modifica o estoque nem inicia pedidos de compra. O período inicial são os últimos 180 dias encerrados (até ontem, em Brasília); data da emissão ou abertura aproxima a data de aplicação.

- Rankings por número de OS distintas e por quantidade aplicada. Quantidades só são comparadas após selecionar uma unidade conhecida. Empresas e unidades ficam em linhas separadas, mesmo para o mesmo código de produto. Nomes de unidade são normalizados por caixa/espaços; não há conversão entre unidades.
- Consumo médio diário = quantidade positiva aplicada / todos os dias corridos do período. Dias sem aplicação estão incluídos no denominador. Média por 30 dias = média diária × 30.
- Prazo de reposição inicial: **7 dias**, informado pelo usuário. Margem de segurança inicial: **7 dias**; ciclo de revisão inicial: **30 dias**. Estes dois últimos são premissas ajustáveis de simulação, não dados inferidos da M8 nem garantia de nível de serviço.
- Mínimo (ponto de pedido) = média diária × (reposição + segurança). Máximo (nível alvo) = média diária × (reposição + segurança + revisão). Arredondamento para cima em unidades/peças inteiras e duas casas nas demais unidades.
- A sugestão exige que todas as OS processadas da empresa no período tenham detalhes completos, período de pelo menos 30 dias, pelo menos 3 OS em 3 dias distintos e unidade conhecida. OS processadas sem data ou itens com código/quantidade inválidos bloqueiam a simulação da empresa e são sinalizados. O ranking parcial continua visível.
- Itens excluídos, quantidades nulas/não positivas/não finitas e materiais sem código não entram no consumo. Quantidades negativas não são presumidas como devoluções de almoxarifado. Sem consumo no período, o produto não aparece; esta tela não é um catálogo de itens parados.
- Frequência em OS é um indicador de recorrência, **não o giro real de estoque**. Não há saldo atual/médio, movimentos de entrada/saída, lotes de compra, sazonalidade ou compras em aberto nesta base. Esses dados serão necessários para calcular giro, cobertura atual e quanto comprar.
- O CSV inclui período, parâmetros, cobertura e motivos de indisponibilidade, além dos valores calculados. O link de histórico usa o código exato do produto, empresa e período.

O mínimo segue a lógica de consumo durante o prazo de reposição mais reserva descrita pela [SAP](https://learning.sap.com/courses/consumption-based-planning-and-forecasting-in-sap-cloud-erp/understanding-the-net-requirements-calculation-for-reorder-point-planning). A escolha do máximo é uma política explícita desta simulação: acrescentar demanda do ciclo de revisão. O conceito de repor até um nível máximo é descrito pela [Oracle](https://docs.oracle.com/cd/A60725_05/html/comnls/us/inv/mnmxplan.htm). A simulação não equivale a uma previsão estatística validada nem calcula saldo disponível.

As consultas de cobertura e consumo usam uma mesma transação de leitura com snapshot consistente, enquanto o integrador continua trabalhando. Não foi necessária uma nova migration. As premissas e filtros ficam na URL; não são gravados como política oficial por produto.

Materiais excluídos da OS permanecem na consulta histórica, com descrição em vermelho e indicação “Excluído da OS”, inclusive nos detalhes. O CSV informa a situação do material. A contagem de materiais por OS inclui os excluídos e informa quantos são; o indicador geral de itens ativos continua considerando apenas os ativos. Os excluídos não entram no consumo nem nas sugestões de estoque mínimo e máximo.

### Diagnóstico de consulta na Vercel

O login usa Supabase Auth; consultar dados exige também `DATABASE_URL` no ambiente do deployment. Depois de alterar variáveis, faça um novo deploy. Use o mesmo valor funcional de `web/.env.local`, sem copiar aspas externas ou o prefixo `DATABASE_URL=`. O site verifica TLS usando `certs/supabase-ca.crt`; não adicione parâmetros `ssl*` à URL.

As APIs registram apenas códigos seguros nos logs de execução e na resposta JSON (`code`), sem credenciais nem SQL. `DATABASE_URL_MISSING`: variável ausente; `DATABASE_URL_SSL_PARAMETERS`: parâmetros TLS na URL; `28P01`: autenticação do banco; `ENOENT`: arquivo de certificado ausente; `ENETUNREACH`/`ETIMEDOUT`/`DATABASE_TIMEOUT`: conectividade ou tempo limite; `42P01`/`42703`: tabela/coluna ausente, confira banco e migrations. Consulte o código em Logs na Vercel após reproduzir o erro. Códigos genéricos exigem investigação adicional; não indicam uma causa confirmada.

### Produtos e estoque atual

As consultas por material, detalhes da OS e análise exibem preços atuais do cadastro, quantidade em estoque, disponível e valor estimado a custo médio, com horários de coleta separados. CSV inclui os mesmos valores e horários. O valor vendido por unidade usa o total do item dividido pela quantidade e compara com o mínimo atual somente para unidades compatíveis e itens não excluídos. A referência não é o preço histórico na data da OS. Estoque é agregado por empresa entre seus estabelecimentos. As sugestões de mínimo/máximo continuam níveis alvo e não geram compras. Configuração e operação: [atualização de produtos](../docs/atualizacao-produtos.md).

## Catálogo do fabricante

A rota `/fabricante` pesquisa peças da planilha e relaciona os códigos às referências e aos códigos de similaridade do M8. Informando empresa e série completa, exibe também os materiais das OS associadas. A importação, atualização de revisões e os critérios de correspondência estão em [Catálogo do fabricante](../docs/catalogo-fabricante.md).

## Fotos dos produtos M8

O botão **Ver fotos** aparece na consulta por material, no detalhe dos materiais da OS e nos produtos M8 relacionados ao catálogo do fabricante. As fotos são carregadas somente ao abrir a galeria, com navegação e fechamento por Escape. A identificação informa produto e empresa: a foto é do cadastro M8, não uma imagem proveniente da planilha.

Configure também no servidor web/Vercel as variáveis `M8_API_URL`, `M8_TENANT`, `M8_USERNAME`, `M8_PASSWORD` e `M8_DOMAIN`, com os mesmos valores usados pelo integrador. Elas não usam prefixo `NEXT_PUBLIC`. As credenciais locais já foram copiadas para o arquivo privado `web/.env.local`. Alterações nas variáveis da Vercel exigem novo deploy. As empresas 1, 2 e 27404 são autenticadas separadamente; `M8_COMPANY` não determina a empresa da foto, que vem do produto selecionado.

A rota autenticada `/api/products/{company}/{id}/images` consulta `GET /v1/estoque/produto/{produtoId}/imagem`. O retorno real confirmado é uma lista `data` com `formato` e `imagem` em Base64. O backend valida os bytes, disponibiliza cada imagem por uma URL interna autenticada e não envia tokens M8 ao navegador. URLs externas e SVG não são aceitos. JPEG, PNG, GIF e WebP são exibidos, com limite de 3 MB por imagem e 16 MB para a resposta M8; itens incompatíveis são sinalizados.

O cache é temporário, em memória de cada instância do servidor web: até 10 minutos para fotos e 2 minutos para resultados vazios, com limite total de 32 MB/32 produtos. Requisições simultâneas do mesmo produto e empresa compartilham a consulta. Instâncias novas ou diferentes podem consultar novamente o M8. As respostas ao navegador usam `private, no-store`, inclusive os bytes das fotos. Não há armazenamento no Supabase, migration, timer novo ou atualização do integrador para instalar no servidor Linux.

## Valores e serviços no detalhe da OS

Cada material mostra, abaixo da quantidade, o valor total registrado no item da OS. A seção **Serviços aplicados** consulta os serviços já importados para a mesma empresa e OS e mostra descrição, código, quantidade, valor unitário e total, com os demais campos ao expandir.

O resumo soma os totais dos materiais não excluídos e dos serviços, em centavos, e compara com o total informado pelo ERP. Não recalcula o item usando o preço atual do cadastro e não deduz descontos novamente. Se houver diferença, ela aparece como valor a conferir, sem atribuir uma causa. Coleta pendente ou valor ausente impede a conferência. Esta mudança não exige migration nem atualização do integrador.
