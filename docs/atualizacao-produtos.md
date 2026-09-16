# Produtos, preços e estoque M8

Esta extensão usa o servidor existente. O site lê somente o Supabase. Não altera preços, estoques, reservas ou OS no ERP.

## O que é sincronizado

- Cadastro das empresas 1, 2 e 27404: preço de venda, mínimo, unidade, identificação e payload completo. Produtos repetidos por localização são agrupados, preservando `localizacoes`; divergências em outros campos interrompem a carga. A listagem usa `Page=0&PageSize=0`, com limite de resposta do cliente HTTP; excesso interrompe a coleta, sem truncar silenciosamente.
- Todas as coletas de cadastro são completas, sem filtros de data, a cada 15 minutos após o término. Em testes reais, a paginação omitiu parte do catálogo da empresa 27404, e filtros de atualização não localizaram um produto conhecido no intervalo testado. Por isso não foi habilitada a proposta inicial de incremental por data. A marca de sucesso avança somente após a resposta completa e todas as gravações terem sucesso. A API não garante snapshot remoto; a repetição completa reduz lacunas por mudanças concorrentes.
- Histórico de preços: registra mudanças observadas desde a implantação. Não recupera o preço vigente na data de uma OS antiga.
- Estoques e disponível: monitoram todos os produtos do catálogo, inclusive sem histórico de OS. Na coleta detalhada, a tentativa mais antiga vem primeiro; em empate, produtos com histórico de OS têm prioridade. Assim a carga avança também pelos demais produtos e falhas não monopolizam a fila. Novos produtos entram após a importação do cadastro. A fila é reparada automaticamente para cadastros antigos sem registro de controle.
- Disponível: lotes de 50 IDs, `EmpresaId` correspondente à empresa autenticada, `Page=0&PageSize=0`. A API pode omitir produtos. Omissão não significa zero: produtos retornados são atualizados e os demais conservam a última coleta. A rotina detalhada também preenche disponível, quando retorna um saldo explícito. Respostas com IDs inesperados ou duplicações de estabelecimento são recusadas.
- Detalhes: quantidade em estoque, disponível, custo médio, preço do estabelecimento e payload com compras/reservas/localização, por empresa/produto/estabelecimento. Gravação atômica por produto. Coleta detalhada não sobrescreve disponível obtido mais recentemente.
- O site soma os estabelecimentos dentro de cada empresa; não mistura empresas. Valor financeiro é estimado por `soma(estoque × custo médio)` e fica indisponível se faltar um dos custos/saldos. Valores nulos não viram zero.

## Frequência real

Três serviços independentes, com locks por empresa/modo, sem sobreposição com outra execução do mesmo modo:

| Rotina | Agendamento |
|---|---|
| Cadastro/preços | 15 minutos após terminar a execução anterior |
| Disponível em lote | 5 minutos após terminar a execução anterior |
| Estoque completo/custos | A cada 5 minutos após terminar, até 1.000 produtos por empresa; só coleta quem está sem detalhes ou com mais de 1 hora |

As consultas detalhadas usam no máximo duas chamadas simultâneas ao ERP e gravam lotes de até dez produtos, reduzindo viagens ao banco. A fila detalhada prioriza a tentativa mais antiga e continua no próximo ciclo; falhas não bloqueiam os demais produtos. A carga inicial pode exigir vários ciclos. Estes intervalos não garantem que todos os saldos tenham no máximo 5 minutos/1 hora: duração, tamanho da fila e omissões do ERP influenciam a defasagem. O site mostra a data de cada informação e marca preços acima de 30 minutos, disponível acima de 15 minutos e estoque completo acima de 2 horas como desatualizados. O disponível percorre todo o catálogo em lotes de 50; seu ciclo poderá durar mais com a ampliação. Use `sync:products:status` para medir a cobertura e ajustar capacidade antes de aumentar chamadas.

## Comparação na OS

O indicador vendido por unidade é **valorTotal do item dividido pela quantidade**; ele não recalcula tributação nem presume a semântica dos campos de desconto do ERP. A diferença compara esse indicador com o mínimo **atual do cadastro**, somente quando unidades coincidem, quantidade é positiva e o material não está excluído. Percentual não é calculado quando o mínimo é zero. Não prova descumprimento da política vigente na data da venda. Preço de estabelecimento fica preservado no banco, mas não substitui silenciosamente o preço do cadastro.

Os excluídos continuam vermelhos e fora do consumo. Mínimo/máximo sugeridos continuam níveis alvo baseados no consumo. O saldo atual é mostrado ao lado para análise, sem gerar pedidos ou descontar reservas novamente.

## Atualizar o servidor Ubuntu existente

Baixe `.m8/m8-integrador.tar.gz` do workspace e envie do PowerShell (pasta Downloads):

```powershell
scp .\m8-integrador.tar.gz root@187.77.36.214:/root/m8-upload/
```

No SSH, como root, execute os blocos em ordem. Se um comando falhar, não prossiga ao próximo bloco.

```bash
systemctl stop m8-integrador.timer
systemctl stop m8-integrador.service
```

O serviço de OS pode levar alguns minutos para encerrar a coleta em andamento; checkpoints já confirmados são preservados. Se esta extensão já estiver instalada, pare também seus três timers e serviços antes de atualizar os arquivos.

```bash
tar -xzf /root/m8-upload/m8-integrador.tar.gz -C /opt/m8-integrador
chown -R m8-integrador:m8-integrador /opt/m8-integrador
cd /opt/m8-integrador
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run build
sudo -u m8-integrador npm run db:migrate
```

O pacote não contém `.env` nem certificado privado de configuração; mantenha os arquivos já existentes. Usa as mesmas variáveis M8 e DATABASE_URL. As migrations 006 e 007 são aditivas; não altere migrations anteriores.

```bash
install -m 644 deploy/systemd/m8-produtos@.service /etc/systemd/system/
install -m 644 deploy/systemd/m8-produtos-*.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/m8-produtos@.service /etc/systemd/system/m8-produtos-*.timer
systemctl daemon-reload
systemctl enable --now m8-integrador.timer
systemctl start --no-block m8-integrador.service
systemctl start --no-block m8-produtos@catalog.service
```

Confirme o encerramento do cadastro e só então ative os timers de estoque:

```bash
journalctl -u m8-produtos@catalog.service -n 30 --no-pager
systemctl enable --now m8-produtos-catalog.timer m8-produtos-available.timer m8-produtos-detail.timer
systemctl start --no-block m8-produtos@available.service m8-produtos@detail.service
```

Conferência:

```bash
cd /opt/m8-integrador
sudo -u m8-integrador npm run sync:products:status
systemctl list-timers --all 'm8-produtos-*'
journalctl -u m8-produtos@available.service -u m8-produtos@detail.service -n 30 --no-pager
```

A Vercel recebe a nova interface pelo GitHub. Não precisa de credenciais M8 nem de cron da Vercel. Para consultar as novas colunas, o banco precisa das migrations 006/007; elas já foram aplicadas neste Supabase durante a implantação inicial.


## Atualização para coletar produtos sem histórico de OS

O pacote atualizado mantém os mesmos serviços, limites e variáveis. Não exige
migration nova. `monitored` agora corresponde a todo o catálogo;
`with_os_history` informa quantos produtos aparecem em OS, e `stock_missing` /
`available_missing` mostram quantos ainda não têm saldo coletado.

1. Envie o pacote pelo PowerShell, na pasta Downloads:

```powershell
scp .\m8-integrador.tar.gz root@187.77.36.214:/root/m8-upload/
```

2. No SSH, pare os timers e aguarde o encerramento dos serviços antes de trocar os arquivos:

```bash
systemctl stop m8-integrador.timer m8-produtos-catalog.timer m8-produtos-available.timer m8-produtos-detail.timer m8-equipamentos.timer
systemctl stop m8-integrador.service m8-produtos@catalog.service m8-produtos@available.service m8-produtos@detail.service m8-equipamentos.service
```

3. Atualize e compile. Execute cada comando somente se o anterior terminar sem erro:

```bash
cd /opt/m8-integrador
tar -xzf /root/m8-upload/m8-integrador.tar.gz -C /opt/m8-integrador
chown -R m8-integrador:m8-integrador /opt/m8-integrador
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run build
```

4. Retome os agendamentos e inicie as coletas de saldos:

```bash
systemctl start m8-integrador.timer m8-produtos-catalog.timer m8-produtos-available.timer m8-produtos-detail.timer m8-equipamentos.timer
systemctl start --no-block m8-produtos@available.service m8-produtos@detail.service
sudo -u m8-integrador npm run sync:products:status
journalctl -u m8-produtos@detail.service -n 40 --no-pager
```

Não execute uma carga detalhada ilimitada: o padrão continua em 1.000 produtos
por empresa por ciclo, com duas chamadas simultâneas. A primeira cobertura
completa ocorrerá progressivamente. Produtos omitidos pelo ERP continuam como
“A consultar” quando não existe saldo anterior; omissão nunca vira zero.
O pacote contém somente o integrador, sem `.env`, certificado, banco ou aplicação web.
