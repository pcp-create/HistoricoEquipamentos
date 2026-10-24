# Padrão visual dos campos

A referência é o seletor de Cliente de Visitas. O arquivo `web/app/form-controls.css`, carregado no layout raiz, define a aparência dos campos de texto, seleção, data e observações em todos os módulos.

- Fonte DM Sans, peso 400 para valores e placeholders.
- Tamanho 13 px no desktop e 16 px em telas até 640 px, evitando zoom automático no celular.
- Texto azul, placeholder cinza, fundo branco, borda azul clara e raio de 9 px.
- Altura mínima de 44 px e indicação de foco azul.
- Estados desabilitado e inválido definidos na mesma camada.
- Seletores pesquisáveis usam `OrderSearchSelect`; títulos das opções em peso 700, ID e detalhes em peso 400.

A camada `form-controls` usa declarações importantes para prevalecer sobre os estilos antigos dos módulos e impedir a herança de negrito dos labels. Alterações visuais devem ser feitas nessa camada, sem criar novos overrides locais. Layout de páginas e grades continua sob responsabilidade de cada módulo. Checkboxes, rádios, arquivos, sliders, cores e botões não são campos de texto e não recebem as regras de dimensões dessa camada.

Os selects nativos existentes mantêm seu comportamento; o padrão compartilhado uniformiza sua apresentação. Novos seletores com pesquisa devem reutilizar `OrderSearchSelect`.
