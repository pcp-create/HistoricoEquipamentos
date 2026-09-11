# Orçamentos internos

A aba **Orçamentos** prepara e salva rascunhos compartilhados entre os usuários autorizados do site. Não cria orçamento no ERP, não envia mensagem ao cliente e não reserva estoque.

## Uso

1. Abra um novo orçamento. O histórico reúne as empresas 1, 2 e 27404, sem seleção de empresa.
2. Busque um cliente por nome, documento ou código e selecione um equipamento. A busca de sugestões inicia automaticamente. Também é possível preencher cliente/equipamento manualmente.
3. Informe o tipo de manutenção. Modelo, versão do fabricante e intervalo ajudam a limitar as peças da revisão. O tipo de manutenção é uma descrição do escopo; não classifica automaticamente as peças.
4. Marque os materiais e serviços desejados. Use o filtro instantâneo ou os botões de adicionar para selecionar materiais/serviços no cadastro geral.
5. Confira as quantidades (iniciam em 1), informe os preços ou use os botões de referência. Só itens selecionados entram no total.
6. Salve o rascunho e reabra pela lista da equipe. A lista mostra até 100 resultados, com os mais recentes primeiro; a pesquisa por número, responsável, cliente, equipamento ou manutenção localiza rascunhos mais antigos. Alterações não salvas geram aviso ao sair; não há salvamento automático.

O orçamento pode ser salvo apenas com os dados do pré-cadastro, sem itens. Cliente, equipamento, tipo de manutenção e responsável podem ficar em branco durante a preparação. O nome do responsável é salvo no rascunho e aparece na lista da equipe. Cada rascunho suporta até 1.000 itens, quantidade com até três casas e preço com até duas casas decimais. Cada linha é arredondada a centavos antes da soma. Preço zero é permitido. Quantidade ou preço em branco não bloqueiam a gravação: os itens e seleções são preservados e o total é identificado como pendente. Valores preenchidos inválidos continuam sendo rejeitados. O total é recalculado no servidor.

## Critérios das sugestões

- Histórico: empresas 1, 2 e 27404, mesmo cliente M8 e equipamento cadastrado ou série normalizada exata. Usa OS Processadas, com detalhes finalizados e sem pendências. Materiais excluídos ficam fora das sugestões. Sem cliente da base, ou sem ID cadastrado/série com ao menos quatro caracteres, o sistema não presume um histórico.
- Se uma OS possui múltiplas máquinas, o M8 pode não atribuir individualmente cada peça/serviço a uma máquina. Os itens da OS são candidatos e precisam de conferência.
- A quantidade de origem vem do item mais recente; o último preço unitário considera o total e a quantidade somados na última OS para cada produto/unidade ou serviço. O preço anterior usa total dividido pela quantidade. A quantidade inicial do orçamento é sempre 1; o consumo anterior não é uma recomendação automática.
- Fabricante: usa a revisão ativa da planilha, modelo, série, versão e intervalo. Inclui os intervalos menores que se repetem, conforme a mesma regra do catálogo. Condições e versões ambíguas permanecem sinalizadas.
- Os vínculos usam referência fabricante (Genuína) primeiro e códigos de similaridade como alternativas. O mesmo produto/unidade aparece uma vez no orçamento consolidado, reunindo as origens. Produtos diferentes continuam como alternativas distintas; não são selecionados automaticamente.
- Uma peça sem vínculo M8 continua disponível pelo código do fabricante, com unidade e preço a conferir.
- Serviços: a seleção geral consulta o cadastro completo de serviços prestados do M8, incluindo os nunca utilizados. Veja [atualização do cadastro de serviços](atualizacao-servicos.md).
- Para histórico muito extenso, a interface informa o limite de 1.000 materiais e 1.000 serviços distintos. A janela de cadastro geral retorna 30 resultados por página e filtra enquanto o usuário digita.

## Valores e alterações

Venda atual e mínimo são referências da última coleta do cadastro de produtos da empresa 1. A empresa da última OS é informada junto ao preço histórico. No histórico, a comparação exige unidade compatível. O último preço da OS é uma referência histórica. Os preços do orçamento ficam gravados como um retrato daquele rascunho; sincronizações futuras do integrador não os alteram. Os botões de referência preenchem o preço, que pode ser editado livremente. Valores abaixo do mínimo são sinalizados sem bloquear.

Buscar sugestões novamente ou mudar versão/intervalo não remove itens já incluídos. Revise a seleção ao mudar o escopo. Alterar cliente ou dados do equipamento solicita confirmação antes de limpar os itens.

## Instalação

Não há atualização do integrador Linux. A interface é publicada pela Vercel com Root Directory `web`.

Execute a migration web com o `DATABASE_URL` e certificado já configurados:

```bash
cd web
npm run db:search
```

A migration `005_quotes.sql` cria somente a tabela interna `web_quotes`. A tabela e sua sequência não concedem acesso aos papéis públicos do Supabase e usam RLS. A API exige o mesmo login e lista de e-mails autorizados do restante do site; gravações também validam a origem.

O pool mantém leitura como padrão. Somente a transação de salvar orçamento utiliza `BEGIN READ WRITE` e escreve em `web_quotes`. O usuário do banco precisa de permissão nessa tabela e sequência. Não são alteradas as tabelas importadas do M8. Criador, último editor, horários e versão são registrados. Uma gravação baseada em versão antiga retorna conflito e exige reabrir o rascunho, evitando sobrescrever alterações de outra pessoa.

O cadastro de clientes/equipamentos e a rastreabilidade das OS dependem também da migration do integrador 008/009 e de sua coleta. Veja [atualização dos equipamentos](atualizacao-equipamentos.md).

### Lista da revisão e histórico de vendas

Selecionar o intervalo exibe automaticamente as peças do fabricante, incluindo os intervalos menores que se repetem. Cada recomendação mostra a referência original e suas opções genuínas/similares, com código interno, estoque, disponível e seleção, quantidade e preço editáveis na mesma linha. Os demais materiais e serviços ficam em **Outros materiais e serviços**, recolhidos inicialmente. Recolher a lista não altera os itens nem o total.

**Mais informações** mostra até cinco OS recentes do mesmo cliente/equipamento, considerando as três empresas, com data, quantidade, valor unitário líquido e total. Linhas do mesmo produto e unidade na mesma OS são somadas; um total ausente permanece desconhecido. A faixa mínima/máxima usa todo o histórico elegível, inclusive vendas anteriores às cinco exibidas, separando unidades diferentes. OS pendentes, outros clientes/equipamentos e materiais excluídos não participam.

**Venda M8** e **Mín. M8** são os preços coletados da empresa 1, quando a unidade é compatível. O máximo exibido é histórico, não um teto cadastrado no ERP. A referência da base geral de serviços fica identificada separadamente em Mais informações, sem ser apresentada como venda ao cliente selecionado. Quantidades e preços do rascunho continuam sob controle do usuário.

Peças sem correspondência no M8 continuam disponíveis para inclusão. Alterar o intervalo preserva itens e preços já editados: itens fora da nova recomendação passam para a lista de outros materiais/serviços. Esta melhoria exige somente a atualização do site, sem migration ou reinstalação do integrador.

### Versão manual e OS identificadas nas observações

Se modelo e série estiverem vazios, **Buscar histórico e fabricante** disponibiliza todas as versões da revisão ativa. Escolha uma versão para carregar seus intervalos e peças; a aplicação permanece sujeita à conferência. A versão manual não preenche uma série nem atribui o histórico de outra máquina ao orçamento.

O histórico inclui OS sem equipamento preenchido quando o integrador confirmou um vínculo pela série nas observações, associado ao cliente e ao cadastro do equipamento. A tabela em **Mais informações** identifica essas OS com **Série nas observações**. São usados apenas vínculos válidos e atualizados; casos ambíguos, pendentes de revisão ou invalidados ficam fora até a reconciliação. A coleta e o cruzamento periódicos do serviço de equipamentos alimentam esses vínculos; não é necessário preencher retroativamente o campo Equipamento no M8.

O filtro **Filtrar materiais e serviços** atua instantaneamente sobre os nomes/códigos da lista e ignora acentos e maiúsculas. Os botões **Adicionar material** e **Adicionar serviço** abrem o cadastro geral para seleção com código existente. Itens adicionados por essa janela mostram a última venda geral, identificada separadamente do histórico do cliente/equipamento; filtrar ou recolher a lista não remove seleções.

Os números das OS no histórico de vendas são links que abrem o histórico em outra aba, filtrado pela empresa e pelo número da OS. Assim o rascunho permanece aberto durante a consulta.

### Saldos, identificação e ordenação dos itens

Materiais adicionados pelo cadastro geral e materiais do histórico exibem estoque e disponível consolidados das empresas 1, 2 e 27404, com abertura por empresa em Mais informações. Os saldos vêm da última coleta do integrador e são recarregados ao abrir o rascunho; não são gravados como quantidades do orçamento. Saldos ausentes aparecem como “A consultar” ou incompletos, sem assumir zero.

Nas opções de cada recomendação e na lista de outros itens, a ordem é genuínas, similares e itens sem classificação confirmada. Dentro de cada grupo, a última venda mais recente vem primeiro; itens sem venda ficam no fim do grupo. A identificação usa o vínculo da referência do fabricante, sem presumir que um produto seja similar apenas por possuir estoque. Genuína aparece em azul e Similar em laranja. O aviso de preço abaixo do mínimo M8 aparece em vermelho.
