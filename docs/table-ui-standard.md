# Padrão de tabelas de cadastro

Referência aprovada: Divisão Comercial (`web/components/task-territories.preview.tsx`).

- Células retas, linhas compactas e botões do sistema; sem pesquisa geral quando houver filtros por coluna.
- Ícone de filtro centralizado à direita do título do cabeçalho.
- Classificação A–Z/Z–A somente no menu, nunca ao clicar no título.
- Filtro com pesquisa de valores, checkbox à esquerda, `(Selecionar tudo)` na primeira linha e estado parcial.
- Aplicar/Cancelar sempre visíveis; somente a lista de valores rola.
- Colagem TSV de células/colunas; edições pendentes até Salvar. Shift+clique seleciona coluna.
- Exibir nomes de usuários; persistir IDs/e-mails. Conservar edições em falhas.
- Coluna Ações centralizada. Não oferecer exclusão em cadastros sincronizados do ERP.
- Dados internos devem sobreviver à sincronização; envio ao ERP deve ser explicitamente habilitado na interface.
