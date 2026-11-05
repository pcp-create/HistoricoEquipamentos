# Integrador M8 0.2.7

Esta versão preserva equipamentos criados pelo portal enquanto ainda não aparecem
na listagem do ERP. A coleta deixa de marcar esses registros como ausentes.
Inclui também a migration 025, que considera o estorno de venda da Serrana
(operação 280), e todas as correções da 0.2.6. A migration 025 já foi confirmada
no banco de produção em 05/11/2026.

A publicação web não instala o integrador no servidor Ubuntu. É necessário
substituir o pacote em `/opt/m8-integrador` para ativar a proteção na coleta.

## Instalação no servidor existente

Baixe o pacote e checksum da release `m8-integrador-v0.2.7` no GitHub. Use o
[roteiro de atualização existente](os-excluidas.md), substituindo **0.2.6** por
**0.2.7** em todos os nomes de arquivos, backups e registros dos timers.

A sequência é: conferir SHA-256, registrar e pausar os timers ativos, aguardar
os serviços terminarem, fazer backup privado da instalação, extrair o pacote
na pasta existente e executar `sudo -u m8-integrador npm ci`. O pacote inclui
os compilados e preserva `.env` e certificados.

Antes de retomar os timers, execute na pasta `/opt/m8-integrador`:

```bash
sudo -u m8-integrador npm run db:migrate
node -p 'require("./package.json").version'
```

O runner verifica checksums e não reaplica migrations já registradas. A versão
deve ser **0.2.7**. Atualize o timer `m8-novas-os.timer` conforme o roteiro,
retome os timers anteriormente ativos e confira os logs:

```bash
journalctl -u m8-equipamentos.service -n 80 --no-pager
systemctl list-timers --all 'm8-*.timer' --no-pager
```

Não há acesso SSH configurado no ambiente de publicação web para instalar esse
pacote automaticamente no servidor do integrador. O pacote disponível para
download não comprova que a instalação no Ubuntu tenha sido realizada.
