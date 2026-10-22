# Ordens de compra e atualização conjunta do integrador

A aba Produtos da Programação mostra **Em compra**, separado por empresa de origem do item e unidade. Usa o `saldo` informado pelo M8, limitado ao mínimo zero; não calcula `quantidade - quantidadeComprada` (a amostra real retorna quantidadeComprada igual à quantidade mesmo antes do recebimento).

Entram ordens ativas Pendente/Aprovado/ParcialmenteAtendido, não reprovadas, com itens não transferidos/cancelados e saldo positivo. Processadas, canceladas e inativas não entram. Esses saldos indicam compras da empresa para o produto, não uma reserva exclusiva daquela OS. Unidades diferentes nunca são somadas. O cursor sobre o total mostra as OCs e a data da coleta. Sem importação aparece “Aguardando integração”; com cabeçalhos ativos ainda pendentes de coleta aparece “Importação parcial”, evitando apresentar um zero definitivo.

O M8 real retorna status numérico `11` acompanhado de `statusNome=ParcialmenteAtendido`, embora o enum Swagger não o liste. Essa combinação foi validada na consulta e é tratada como aberta, somando apenas o saldo restante. Valores desconhecidos continuam rejeitados.

## Contrato e persistência

Documentação consultada: https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json em 22/10/2026.

- GET `/v1/compras/ordemcompra`, paginação explícita Page/ PageSize=1000.
- GET `/v1/compras/ordemcompra/{ordemCompraId}/item`, mesma paginação.
- Cabeçalho consultado por Id antes e depois dos itens para verificar se mudou durante a coleta.
- Migration `017_m8_purchase_orders.sql`: cabeçalhos, itens e controle de última listagem, chaves por empresa/ID e payloads originais. RLS e acesso público revogado.
- `npm run sync:purchases`: consulta as três empresas configuradas, com lock por empresa e snapshots de itens gravados em transação. Erro preserva o snapshot anterior e agenda nova tentativa em cinco minutos.
- A ausência na listagem não remove dados. Uma consulta individual por Id que retorne vazia marca a ordem ausente, preservando o histórico, sem somá-la.
- `M8_PURCHASES_DETAIL_BATCH` (padrão 20, máximo 500) limita detalhes por empresa por execução. Até 75% do lote prioriza ordens abertas, com o restante disponível para o histórico; novos detalhes e coletas mais antigas têm prioridade dentro da fila; ordens abertas voltam à fila após um minuto, demais após 24 horas. A carga inicial pode levar vários ciclos. A idade exibida é a menor data entre listagem e detalhes das ordens abertas da empresa.

O timer dispara a cada minuto, aos 30 segundos, alternado com o timer de orçamentos. Uma execução longa adia a seguinte; o serviço não sobrepõe a si mesmo. Não há atualização garantida em um minuto de todos os itens quando a fila excede o lote.

## Instalar junto com os orçamentos pendentes

O pacote `artifacts/m8-integrador-orcamentos-compras.tar.gz` contém o integrador compilado, fontes, migrations e unidades systemd atuais, inclusive orçamentos. Não contém `.env`, certificados, credenciais nem alterações da aplicação web. Copie-o para o servidor. Faça backup do diretório atual e substitua os arquivos durante a janela de manutenção habitual, preservando `.env`, certificados e permissões do usuário do serviço.

Na instalação existente em `/opt/m8-integrador`, após extrair o pacote e conferir a propriedade dos arquivos:

```sh
cd /opt/m8-integrador
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run build
sudo -u m8-integrador npm run db:migrate
sudo install -m 644 deploy/systemd/m8-orcamentos.service deploy/systemd/m8-orcamentos.timer deploy/systemd/m8-compras.service deploy/systemd/m8-compras.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now m8-orcamentos.timer m8-compras.timer
sudo systemctl start --no-block m8-orcamentos.service m8-compras.service
sudo systemctl list-timers --all m8-orcamentos.timer m8-compras.timer
sudo journalctl -u m8-orcamentos.service -u m8-compras.service -n 50 --no-pager
```

As migrations são rastreadas por checksum: a instalação pula as já aplicadas. Outros integradores existentes continuam necessários. Para desfazer apenas a ativação de compras: `sudo systemctl disable --now m8-compras.timer`; preserve as tabelas para histórico. Não reverta migrations nem remova dados.

Verificação:

```sql
SELECT company_id, count(*) AS ordens,
 count(*) FILTER(WHERE detail_at IS NOT NULL) AS com_detalhes,
 count(*) FILTER(WHERE eligible AND present AND (pending OR detail_at IS NULL)) AS abertas_pendentes,
 min(detail_at) FILTER(WHERE eligible AND present) AS coleta_mais_antiga_abertas
FROM m8_purchase_orders GROUP BY company_id ORDER BY company_id;
```

A publicação da interface e a ativação dos timers no servidor são etapas separadas. Preparar o pacote ou executar uma carga local não instala o serviço no servidor.
