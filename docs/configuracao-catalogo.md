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
