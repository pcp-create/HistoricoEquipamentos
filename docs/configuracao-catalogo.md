# Configuração do catálogo do fabricante

Acesse **Configurações** no menu principal. O acesso exige o mesmo login autorizado do sistema.

## Estrutura atual

Selecione uma versão para conferir origem, modelos, condições de série e itens (grupo, descrição, referência genuína, intervalo e observações). A consulta reúne o catálogo original ativo e os cadastros adicionais.

## Planilha modelo

Clique em **Baixar planilha modelo**. Preencha a aba **Itens**, mantendo os títulos das colunas. A aba **Instruções** explica o preenchimento. São aceitos até 1.000 itens por arquivo, com limite de 2 MB. Use valores, sem fórmulas.

Campos obrigatórios: fabricante, modelo, versão, grupo, descrição da peça, referência genuína e intervalo em horas. Faixa de série e observações são opcionais.

- Referência genuína: uma por item, de 6 a 24 letras/dígitos, contendo ao menos um número. O modelo formata as células como texto para preservar zeros iniciais. Esse formato mantém compatibilidade com os índices de referência/similaridade existentes no M8.
- Intervalo: inteiro entre 1 e 100000 horas, como `4000`. Outros tipos de intervalo não fazem parte deste modelo inicial.
- Série: `BQD100000 ...` significa BQD a partir de 100000, inclusive. Para faixa fechada, use `DE BQD100000 ATÉ BQD199999`. Sem série, o sistema não confirma automaticamente a aplicação pela série.
- Cada combinação de fabricante, modelo e versão possui uma faixa única. Para mudar a faixa, use outra versão.

Selecione o arquivo preenchido, confira a prévia e clique em **Confirmar importação**. Se houver erro, corrija a planilha e selecione-a novamente. Nenhum dado é gravado na prévia.

## Cadastro manual

Preencha o formulário **Adicionar item manualmente**. As mesmas regras da planilha são aplicadas. Após salvar, fabricante/modelo/versão/intervalo permanecem preenchidos para facilitar a inclusão de outras peças.

## Persistência e integração

Os novos dados são gravados nas tabelas existentes `manufacturer_revisions`, `manufacturer_variants` e `manufacturer_entries`, em um conjunto adicional identificado por `report.managed=true`. Não é necessária uma migration nova nem alteração no integrador.

A revisão original ativa permanece intacta. Trocar a revisão original pelo importador CLI não remove os itens adicionais. O catálogo e as sugestões de orçamentos consultam ambos os conjuntos. Itens adicionais idênticos são ignorados ao reenviar; a importação é aditiva, não atualiza nem exclui itens anteriores. Qualquer conflito cancela o lote inteiro.

As peças cadastradas se vinculam ao M8 pela referência genuína normalizada e pelos códigos de similaridade já indexados. Sem produto correspondente, a referência permanece visível no catálogo. O cadastro não cria produtos no ERP.

## Editar itens existentes

Selecione uma versão em **Estrutura atual** e clique em **Editar** na linha da peça. Altere grupo, descrição, referência/código, intervalo ou observações e clique em **Salvar alterações**. **Cancelar** descarta a edição. A versão e a origem permanecem associadas ao item.

Para vínculo direto, use `M8:19273`, por exemplo. O código deve existir na base de produtos. Referências genuínas continuam usando a normalização habitual. É possível manter referência ou intervalo em branco quando não informados. Intervalos novos são informados em horas inteiras; textos antigos de condições podem ser preservados sem alteração.

A edição mantém o ID do item e registra usuário, data e valores anteriores no relatório da revisão. Se outro usuário alterar o item durante a edição, o sistema impede a sobreposição e solicita atualizar a lista. As alterações valem para novas consultas; não modificam itens já salvos em rascunhos de orçamento.

As seleções de versões no catálogo e nos orçamentos mostram um resumo das condições ao lado do nome. Textos extensos são abreviados, e a descrição completa continua no detalhamento da versão.

### Informações adicionais no cadastro manual

O formulário também permite informar **Código M8, Quantidade, Código da vista, Percentual venda (médio)** e **Condições de aplicação da versão**.

- Informe referência genuína ou código M8. Quando ambos são preenchidos, o vínculo usa o código interno e a referência é preservada nas observações.
- O código interno precisa existir no cadastro M8. A quantidade e o percentual aceitam decimais com vírgula ou ponto.
- Quantidade, código da vista e percentual são preservados nas observações; não alteram automaticamente quantidades ou preços dos orçamentos.
- Escolha **Somente modelo** para dispensar a série. Escolha **Não informado na fonte** quando não houver intervalo de manutenção.
- As condições pertencem à versão e aparecem em seu detalhamento. Uma versão existente não aceita condições divergentes; use o mesmo conteúdo ou outra versão.

Esses campos adicionais estão disponíveis no cadastro manual. O modelo XLSX genérico mantém as colunas anteriores; a planilha W800/W900 continua usando sua importação específica.
