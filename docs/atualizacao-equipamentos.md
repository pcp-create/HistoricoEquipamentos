# Cadastro de equipamentos e vínculos com o histórico

## Coleta

- O cadastro compartilhado usa **somente empresa 1**, endpoint `GET /v1/estoque/equipamento`, com `Page=0&PageSize=0`. O payload original é preservado em `m8_equipment_catalog`.
- Os clientes são obtidos por `GET /v1/configuracoes/cliente`. Isso permite selecionar clientes/equipamentos que ainda não possuem OS importada. O cadastro de clientes e os vínculos pessoa–equipamento mantêm a empresa de origem internamente.
- A consulta documentada `GET /v1/estoque/equipamento/pessoa/{pessoaId}` retorna o ID do vínculo, equipamento, pessoa e nomes. A série é obtida do cadastro compartilhado.
- Na API atual, `/pessoa/0` retornou vínculos de vários clientes. Esse comportamento **não é documentado**: ele é usado somente para antecipar os registros retornados. Ausência nessa resposta não exclui um vínculo. Se falhar, a rotina continua pela fila individual.
- A fila consulta até 100 pessoas por empresa por ciclo, com duas chamadas simultâneas. Prioriza clientes com OS recentes e ainda não conferidos. Uma resposta individual válida substitui os vínculos atuais daquela pessoa; resposta inválida ou falha preserva a coleta anterior e agenda nova tentativa. Registros antigos são preservados com `present=false`.
- O timer executa 15 minutos após o término anterior. Pessoas conferidas voltam à fila após 24 horas. A primeira rodada individual é gradual e pode levar aproximadamente um dia para a base atual; acompanhe `not_checked`, `failures` e datas. Os vínculos antecipados já podem ser consultados antes do fim dessa rodada.

Os GET não alteram o M8. As tabelas internas têm RLS e não concedem leitura direta aos papéis públicos do Supabase. As migrations são `008_m8_equipment_registry.sql` e `009_m8_equipment_link_safety.sql`.

## Séries e modelos

Na amostra real, `numeroSerie` estava vazio, mas os nomes continham séries. A regra extrai apenas textos explicitamente identificados por “SÉRIE”, “SERIAL” ou “S/N”, preserva o original e informa `serial_source=nome`. Ignora placeholders como NC, N/C, FALTA SÉRIE e sequências triviais; mais de uma série no nome exige conferência. O campo estruturado, quando válido, tem prioridade.

Modelos GA/GX/G são identificados para cruzar com o comparativo já importado. Nomes de outros fabricantes são mantidos; o sistema não inventa uma correspondência na planilha. Múltiplos modelos permanecem sinalizados.

## Associações com as OS

As associações ficam separadas em `m8_order_equipment_links`, com método, campo de origem, valor encontrado, motivo, versão da regra e horário. **Nenhum campo original da OS é preenchido ou sobrescrito pela inferência.**

- `explicit`: ID de produto/equipamento estruturado no ERP (`produtoEquipamentoId`/`equipamentoProdutoId`) presente no catálogo.
- `serial`: série estruturada completa que identifica um único equipamento cadastrado para o cliente naquela empresa.
- `observation`: série completa com pelo menos seis caracteres encontrada nas observações ou descrição, com limites de token, equipamento vinculado ao cliente e sem duplicidade ou conflito. Séries exclusivamente numéricas exigem rótulo de série adjacente para não confundir notas fiscais e números de OS.
- `review`: modelo sem série, série repetida no cliente, menção negativa/antiga ou conflito com a identificação estruturada. Fica visível no detalhe, mas **não entra** na expansão automática do histórico, catálogo ou orçamento.

São analisadas observações da OS, dos equipamentos e das manutenções. Alterações das fontes invalidam os vínculos anteriores até recalcular. O recálculo acontece depois da coleta de equipamentos e ao final do ciclo de OS. Também pode ser executado sem acessar o ERP com `npm run sync:equipment -- --relink`.

Essas regras são conservadoras, mas texto livre não comprova por si só que uma peça foi aplicada a uma máquina específica. OS com várias máquinas e cadastros de propriedade que mudaram ao longo do tempo exigem conferência. O detalhe mostra a origem de cada associação automática.

## Interface e orçamento

A pesquisa global, os filtros de equipamento/modelo/série e o histórico da série também consultam os vínculos utilizáveis. Campos vazios da apresentação podem ser complementados pelo cadastro, sempre com indicação da origem. O detalhe mostra inclusive candidatos a conferir e acesso às peças do fabricante.

O orçamento **não possui seletor de empresa**. Clientes/equipamentos são consolidados e o histórico reúne as empresas 1, 2 e 27404, com o mesmo cliente e equipamento/série. A origem da OS permanece nas referências. O último preço é o mais recente entre as OS elegíveis; venda e mínimo atuais usam o cadastro de produtos da empresa 1 como referência e continuam editáveis. A seleção por ID cadastrado evita tratar modelos iguais como a mesma máquina. Equipamentos encontrados apenas no histórico continuam como alternativa quando não há cadastro correspondente.

## Atualizar o servidor Ubuntu

Baixe o pacote `.m8/m8-integrador.tar.gz` para Downloads e envie pelo PowerShell:

```powershell
scp .\m8-integrador.tar.gz root@187.77.36.214:/root/m8-upload/
```

No SSH, pare apenas os serviços M8 antes de trocar os arquivos. Execute os blocos em ordem; se houver falha, confira antes de prosseguir. Os serviços de outro integrador da empresa não são alterados.

```bash
systemctl stop m8-integrador.timer m8-produtos-catalog.timer m8-produtos-available.timer m8-produtos-detail.timer
systemctl stop m8-integrador.service m8-produtos@catalog.service m8-produtos@available.service m8-produtos@detail.service
```

Em atualizações futuras, pare também `m8-equipamentos.timer` e `m8-equipamentos.service` antes da extração.

```bash
tar -xzf /root/m8-upload/m8-integrador.tar.gz -C /opt/m8-integrador
chown -R m8-integrador:m8-integrador /opt/m8-integrador
cd /opt/m8-integrador
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run build
sudo -u m8-integrador npm run db:migrate
```

O pacote preserva os arquivos `.env` e certificado existentes; não contém credenciais. As migrations 008/009 já foram aplicadas ao Supabase deste projeto e serão reconhecidas como já aplicadas.

```bash
install -m 644 deploy/systemd/m8-equipamentos.service /etc/systemd/system/
install -m 644 deploy/systemd/m8-equipamentos.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/m8-equipamentos.service /etc/systemd/system/m8-equipamentos.timer
systemctl daemon-reload
systemctl enable --now m8-equipamentos.timer
systemctl start --no-block m8-equipamentos.service
systemctl start m8-integrador.timer m8-produtos-catalog.timer m8-produtos-available.timer m8-produtos-detail.timer
```

Conferência:

```bash
cd /opt/m8-integrador
sudo -u m8-integrador npm run sync:equipment:status
systemctl list-timers --all m8-equipamentos.timer
journalctl -u m8-equipamentos.service -n 30 --no-pager
```

A Vercel recebe a interface pelo GitHub. O workspace valida a carga inicial, mas **o agendamento permanente depende da instalação desse timer no servidor**.

Contrato consultado: [OpenAPI do M8](https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json), também acessível pela [documentação](https://api.integra.m8sistemas.com.br/docs/index.html).
