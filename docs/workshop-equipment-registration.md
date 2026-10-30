# Cadastro de máquinas pela entrada da oficina

“Adicionar equipamento” aparece na pesquisa da entrada. O cadastro ocorre dentro da mesma janela, preservando oficina, datas e observações já preenchidas. Ao confirmar o M8, o catálogo compartilhado é preenchido imediatamente e a máquina fica selecionada; a entrada na oficina ainda depende de “Confirmar entrada”. Não é criado vínculo automático com uma pessoa/cliente, pois o formulário não solicita cliente.

O servidor fixa origem **Nacional** (confirmada pelo usuário), e gera nome e apelido em caixa alta. Clientes mantêm `TIPO - MODELO XXX - SÉRIE XXX`. Para próprios, a nomenclatura segue os itens 3 e 4 do **POP – Gestão e Controle dos Equipamentos de Locação**, revisão 0, fornecido pelo usuário:

- Parafuso: `COMPRESSOR PARAFUSO POTÊNCIA - VAZÃO - MODELO - PRESSÃO - TENSÃO/FREQUÊNCIA - CARACTERÍSTICA - SÉRIE`.
- Pistão: `COMPRESSOR PISTÃO VAZÃO - MODELO - POTÊNCIA - PRESSÃO - TENSÃO/FREQUÊNCIA - CARACTERÍSTICA - SÉRIE`.
- Unidade compressora: `UNIDADE COMPRESSORA PISTÃO VAZÃO - MODELO - POTÊNCIA - CARACTERÍSTICA - SÉRIE`.
- Secador: `SECADOR DE AR VAZÃO - MODELO - TENSÃO/FREQUÊNCIA - CARACTERÍSTICA - SÉRIE`.
- Separador: `SEPARADOR CONDENSADO CONFIGURAÇÃO CAPACIDADE - MODELO - PRESSÃO - CARACTERÍSTICA - SÉRIE`.

Dados opcionais ausentes ou não aplicáveis são omitidos, sem estimativas, separadores vazios, conversão de pressão ou frequência presumida. Números no nome usam vírgula decimal e unidades HP/PCM/BAR/PSI/LBS/L/V/HZ. Os exemplos do POP são cobertos por testes, incluindo tensão dupla, pressão PSI/BAR, separador sem modelo e unidade com características. Nome e apelido são idênticos. Modelo Resumido contém somente a identificação digitada no campo Modelo.

Equipamentos próprios exigem Código de Identificação Interno, altura, largura, comprimento e peso bruto. O código preserva zeros à esquerda; as quatro medidas são numéricas, positivas e aceitam até três casas decimais. As dimensões usam **metros**, conforme confirmado pelo usuário, sem conversão antes de enviar ao M8. O peso bruto usa quilogramas (`tipoPeso: "Quilo"`). O payload usa `codigoIdentificacaoInterno`, `produtoAltura`, `produtoLargura`, `produtoComprimento` e `pesoBruto`. Cadastros de clientes não exigem nem enviam esses campos. Confirmações de requisições antigas já registradas continuam recuperáveis sem um novo POST ao M8.

O formulário de próprios mostra os campos correspondentes ao tipo, incluindo tensão, frequência, características, configuração e capacidade do separador e pressão adicional em PSI/LBS. Modelo é opcional no separador. `SÉRIE N/C` exige confirmação explícita de que não há série disponível; não é atribuído simplesmente porque o usuário deixou o campo vazio. Máquinas distintas confirmadas sem série podem ter o mesmo nome; o UUID impede reenvios duplicados e um envio ainda incerto continua protegido por nome.

Unidade Compressora Pistão foi incluída somente para próprios. O usuário confirmou que seu NCM deve ser o mesmo do Compressor Pistão: **84148011**. Não foi inferido um NCM a partir do nome.

Capacidades e observações são preservadas nas informações complementares; para clientes, modelo e série usam `modeloGerador` e `numeroSerieGerador`. Para próprios, o modelo usa `modeloResumido`, HP usa o campo numérico `potencia` e a série fica no nome/apelido e nas informações complementares (o POST de produto não expõe série estruturada).

O POP também descreve compra/venda, transferência de parque e complementação técnica posterior pelo Planejamento. Esta mudança ajusta o formulário de **novo cadastro na entrada da oficina**; não executa compras, vendas, transferências de proprietário, ajustes de estoque ou alterações em cadastros existentes.

Para clientes: NCM 00000000, gênero código 00, SPED 07, família USO E CONSUMO, grupo 97. O gênero é enviado pelo código documentado; a API não oferece ID separado para gênero. Para próprios, o modelo de payload contempla NCM por tipo, gênero 84, SPED 00, família EQUIPAMENTO DE LOCAÇÃO, grupo 96, categoria DIVERSOS e preços opcionais. Família, unidade UN/UNIDADE, categoria e grupo são validados em consultas ao M8, sem confiar em IDs enviados pelo navegador.

## Endpoints e classificação

Contrato consultado: https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json (`EquipamentoRequestDto`, `EquipamentoUpdateRequestDto`, `ProdutoRequestDto`, `TipoProdutoEnum`). Clientes usam POST `/v1/estoque/equipamento`. Como esse POST e seu PATCH não expõem classificação 2/3, o usuário autorizou usar POST `/v1/estoque/produto` **somente para próprios**, com `tipoProduto: EquipamentoProduto` (classificação 3). Os dois fluxos estão habilitados e compartilham validação, prevenção de duplicidades, auditoria e seleção imediata. Nenhum campo adicional não documentado é enviado ao M8. O campo aceito para gênero é `codigoGenero` (00 ou 84), em vez de um ID separado.

## Persistência e confirmação

Aplicar `web/sql/088_workshop_equipment_registrations.sql` com:

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-workshop-equipment-registration.mts
```

A migração foi aplicada à conexão configurada neste ambiente. Cada cadastro tem UUID, ator, documento normalizado, payload, estado (`sending`, `complete`, `rejected`, `uncertain`), ID M8 e datas. O UUID reserva o envio antes do POST; replay de confirmação não repete o POST. Resposta incerta ou sem ID impede um novo cadastro com a mesma série/nome. A interface mantém o UUID e os campos bloqueados para consultar novamente. Cadastro confirmado é gravado antes do catálogo local; uma falha local pode ser recuperada pelo mesmo UUID sem repetir o envio ao ERP. Replays não sobrescrevem edições posteriores no catálogo. Duplicidades por nome ou série cadastrada são recusadas, inclusive equipamentos já presentes na oficina.

A entrada registra no evento o vínculo com o cadastro, seu ator, data e campos. O cadastro fiscal permanece no M8; esta tabela registra a origem da inclusão via portal. Nenhum equipamento real foi criado nos testes: apenas consultas de cadastros e simulações de POST.

Validação: testes do modelo/payload, gravação única, confirmação idempotente, bloqueio de duplicados, respostas incertas, permissões, preservação dos dados da entrada e visualização no celular.
