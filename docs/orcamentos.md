# Orçamentos internos

A aba **Orçamentos** prepara e salva rascunhos compartilhados entre os usuários autorizados do site. Não cria orçamento no ERP, não envia mensagem ao cliente e não reserva estoque.

## Uso

1. Escolha a empresa responsável pelo orçamento.
2. Busque um cliente por nome, documento ou código e selecione um equipamento. A busca de sugestões inicia automaticamente. Também é possível preencher cliente/equipamento manualmente.
3. Informe o tipo de manutenção. Modelo, versão do fabricante e intervalo ajudam a limitar as peças da revisão. O tipo de manutenção é uma descrição do escopo; não classifica automaticamente as peças.
4. Marque os materiais e serviços desejados. Use a busca na base de serviços ou inclua materiais/serviços manualmente.
5. Confira as quantidades (iniciam em 1), informe os preços ou use os botões de referência. Só itens selecionados entram no total.
6. Salve o rascunho e reabra pela lista da equipe. A lista mostra até 100 resultados, com os mais recentes primeiro; a pesquisa por número, cliente, equipamento ou manutenção localiza rascunhos mais antigos. Alterações não salvas geram aviso ao sair; não há salvamento automático.

O orçamento pode ser salvo apenas com os dados do pré-cadastro, sem itens. Cliente, equipamento e tipo de manutenção são obrigatórios. Cada rascunho suporta até 1.000 itens, quantidade com até três casas e preço com até duas casas decimais. Cada linha é arredondada a centavos antes da soma. Preço zero é permitido; preço ausente bloqueia a gravação de um item selecionado. O total é recalculado no servidor.

## Critérios das sugestões

- Histórico: mesma empresa, cliente M8 e série normalizada exata. Usa OS Processadas, com detalhes finalizados e sem pendências. Materiais excluídos ficam fora das sugestões. Sem cliente da base ou série com ao menos quatro caracteres, o sistema não presume um histórico.
- Se uma OS possui múltiplas máquinas, o M8 pode não atribuir individualmente cada peça/serviço a uma máquina. Os itens da OS são candidatos e precisam de conferência.
- Quantidade e último preço unitário vêm do item mais recente de cada produto/unidade ou serviço. O preço anterior usa total dividido pela quantidade. A quantidade inicial do orçamento é sempre 1; o consumo anterior não é uma recomendação automática.
- Fabricante: usa a revisão ativa da planilha, modelo, série, versão e intervalo. Inclui os intervalos menores que se repetem, conforme a mesma regra do catálogo. Condições e versões ambíguas permanecem sinalizadas.
- Os vínculos usam referência fabricante (Genuína) primeiro e códigos de similaridade como alternativas. O mesmo produto/unidade da mesma empresa aparece uma vez, reunindo as origens. Produtos diferentes continuam como alternativas distintas; não são selecionados automaticamente.
- Uma peça sem vínculo M8 continua disponível pelo código do fabricante, com unidade e preço a conferir.
- Serviços: a pesquisa consulta os serviços das OS Processadas da empresa, não um cadastro completo de serviços que nunca foram utilizados.
- Para histórico muito extenso, a interface informa o limite de 1.000 materiais e 1.000 serviços distintos. A pesquisa de serviços retorna até 100 resultados e pede refinamento quando houver mais.

## Valores e alterações

Venda atual e mínimo são referências da última coleta do cadastro, da empresa selecionada. No histórico, a comparação exige unidade compatível. O último preço da OS é uma referência histórica. Os preços do orçamento ficam gravados como um retrato daquele rascunho; sincronizações futuras do integrador não os alteram. Os botões de referência preenchem o preço, que pode ser editado livremente. Valores abaixo do mínimo são sinalizados sem bloquear.

Buscar sugestões novamente ou mudar versão/intervalo não remove itens já incluídos. Revise a seleção ao mudar o escopo. Alterar cliente, empresa ou dados do equipamento solicita confirmação antes de limpar os itens.

## Instalação

Não há atualização do integrador Linux. A interface é publicada pela Vercel com Root Directory `web`.

Execute a migration web com o `DATABASE_URL` e certificado já configurados:

```bash
cd web
npm run db:search
```

A migration `005_quotes.sql` cria somente a tabela interna `web_quotes`. A tabela e sua sequência não concedem acesso aos papéis públicos do Supabase e usam RLS. A API exige o mesmo login e lista de e-mails autorizados do restante do site; gravações também validam a origem.

O pool mantém leitura como padrão. Somente a transação de salvar orçamento utiliza `BEGIN READ WRITE` e escreve em `web_quotes`. O usuário do banco precisa de permissão nessa tabela e sequência. Não são alteradas as tabelas importadas do M8. Criador, último editor, horários e versão são registrados. Uma gravação baseada em versão antiga retorna conflito e exige reabrir o rascunho, evitando sobrescrever alterações de outra pessoa.
