# Cadastro de máquinas pela entrada da oficina

“Adicionar equipamento” aparece na pesquisa da entrada. O cadastro ocorre dentro da mesma janela, preservando oficina, datas e observações já preenchidas. Ao confirmar o M8, o catálogo compartilhado é preenchido imediatamente e a máquina fica selecionada; a entrada na oficina ainda depende de “Confirmar entrada”. Para equipamentos de cliente, a seleção do cliente é obrigatória. A pesquisa usa o cadastro completo de clientes, inclusive aqueles que ainda não possuem máquinas. O equipamento é criado no M8 e, para clientes já cadastrados no ERP, o vínculo é enviado pelo novo POST de pessoa/equipamento e confirmado pelo GET. A pendência local permanece somente enquanto não houver confirmação. Consulte `docs/integracao-vinculos-equipamentos.md` para a implementação atual; o histórico abaixo descreve a solução provisória anterior.

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

## Disponibilidade imediata após cadastro

A confirmação do M8 salva imediatamente o catálogo local com os dados informados e, para próprios, a cópia do produto com identificação interna e preços. Não são presumidos saldos de estoque. A interface invalida o cache persistente da lista e avisa telas de equipamentos já abertas para recarregar. Reconsultar o mesmo cadastro não repete o POST nem sobrescreve dados já atualizados pelo ERP.

O integrador preserva registros locais com origem `portal` até recebê-los no catálogo do M8; após essa confirmação, passam a seguir a reconciliação normal de exclusões. Essa proteção requer a atualização do integrador; a disponibilidade imediata e a invalidação do cache são mudanças no portal web.


## Cadastro compartilhado e vínculo pendente

Aplicar `web/sql/103_equipment_customer_links.sql` com `node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-equipment-customer-links.mts`, a partir de `web`. A estrutura foi aplicada ao banco configurado para a validação local. Nenhum equipamento real foi cadastrado durante a implementação.

Oficina, Visitas e criação/edição de OS reutilizam o formulário e o envio idempotente ao ERP. A OS oferece o botão de criação ao lado da seleção, preenche o cliente do formulário e seleciona o equipamento confirmado. O equipamento com vínculo local também participa da busca e da validação de propriedade da OS. Próprios continuam usando o fluxo fiscal existente e não exigem cliente.

`web_equipment_customer_links` preserva equipamento, cliente, autor, origem, solicitação e tarefa de vínculo. O catálogo importado do M8 não recebe vínculos fictícios. `web_effective_person_equipment` reúne os vínculos integrados e os locais ainda pendentes para os módulos que usam o cadastro compartilhado. Ao receber o mesmo par cliente/equipamento em `m8_person_equipment` com `present=true`, um trigger registra a confirmação e conclui a tarefa vinculada. Outro cliente ou equipamento não encerra essa pendência. Depois de confirmado, o ERP passa a ser a fonte do vínculo; uma remoção posterior no ERP não ressuscita o vínculo local.

Nas Visitas, a tarefa passa a solicitar **somente o vínculo manual com o cliente**: o equipamento já foi cadastrado no ERP. Usa o responsável configurado para equipamentos nas Visitas, que deve estar ativo e ter WhatsApp. Um cadastro reutilizado também pode gerar essa tarefa de vínculo, sem novo POST de equipamento. Pedidos para novos Leads são reservados na transação da visita e enviados ao ERP somente depois do commit. Falhas deixam a solicitação recuperável pela lista de máquinas, sem repetir uma criação cujo resultado seja incerto. Registros e observações legados são preservados.

A série é comparada em caixa alta, sem pontuação, espaços ou acentos, preservando zeros à esquerda. O formulário consulta possíveis registros ao digitar e permite usar um cadastro existente. Equivalência exata bloqueia nova inclusão, inclusive no servidor e entre solicitações pendentes. Correspondências parciais são apresentadas para conferência. `N/C` para próprios continua dependendo da confirmação explícita de ausência de série. A validação server-side mantém o bloqueio mesmo quando o navegador não faz a consulta.

Validação adicional: cliente sem máquinas disponível na busca; reuso de série normalizada sem novo cadastro; seleção na OS; cadastro direto nas Visitas; tarefa somente para vínculo; pendência não confirmada por outro cliente e concluída pelo par correto; preservação de dados e idempotência de Leads, visitas e solicitações.

O campo Marca está disponível no cadastro compartilhado da Oficina, Visitas e OS, inclusive para próprios. É preservado no registro da solicitação e no catálogo local e enviado nas informações complementares do equipamento ao ERP; não é enviado um ID de marca presumido.

## Endpoints de vínculo disponíveis

O cadastro compartilhado agora integra o vínculo automaticamente via POST `/v1/estoque/equipamento/pessoa`, com confirmação por GET. Clientes M8 não geram tarefa de vínculo manual; tarefas antigas são concluídas quando o par correto é confirmado. Leads sem ID M8 continuam pendentes. Detalhes, migração 105, rotina e status/inativação: `docs/integracao-vinculos-equipamentos.md`.
