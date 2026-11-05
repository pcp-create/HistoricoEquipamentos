# Vínculos de várias OSs

O seletor de vínculos permite adicionar várias ordens à OS principal, inclusive de empresas diferentes. Cada vínculo possui remoção independente. Adicionar novamente a mesma OS não duplica o vínculo; a OS não pode ser vinculada a si mesma. A remoção valida a versão do vínculo e mantém os demais. Vínculos existentes são preservados.

A programação mantém uma linha por OS principal e reúne os status das vinculadas. O portal técnico e os detalhes da programação consultam os materiais e serviços de todas as vinculadas, preservando empresa e OS de origem e as regras existentes de itens espelhados na principal. Os relatórios de peças, previsão de programação e o almoxarifado usam todos os vínculos. A projeção apresenta todas as referências, sem alterar os valores financeiros.

Antes de publicar, aplicar a migração:

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-multiple-order-links.mts
```

A migração 098 preserva os vínculos, remove apenas registros vazios de vínculos já removidos e altera a chave para incluir empresa e OS de destino. Não requer novo APK.
