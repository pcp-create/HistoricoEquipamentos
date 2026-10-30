# Faróis de status

O padrão global fica em `web/app/globals.css`: círculo de 8 px, halo suave de 3 px e rótulo textual ao lado. Contadores usam números em azul escuro neutro; a cor semântica pertence ao farol.

Usar os tokens `--status-signal-success` (regular/disponível), `--status-signal-warning` (atenção), `--status-signal-danger` (atraso/indisponibilidade), `--status-signal-info` (informativo), `--status-signal-neutral` (ausente/sem informação) e `--status-signal-purple` (categoria secundária, como empréstimo). Estágios cadastrados pelo usuário preservam suas cores.

Novos indicadores podem usar `<span className="status-signal" aria-hidden="true" />`, configurando `--status-signal-color` no elemento ou no contêiner. Sempre manter texto para identificar o status sem depender apenas da cor. Não aplicar o padrão a legendas de gráficos, indicadores de progresso ou pontos de linha do tempo.

Os faróis existentes de preventivas, frota, vendas, projeção, oficina, presença e badges compartilham as medidas globais. A paleta semântica dos cards de preventivas, frota e status de vendas usa os mesmos tokens.
