# Integrador 0.2.1 — clientes, vendedores e fatos comerciais

Pacote cumulativo: inclui a atualização anterior de orçamentos/compras e as migrations 001–019. Não inclui aplicação web, PBIX, arquivos pessoais, `.env`, certificados ou credenciais. Usa a configuração e as credenciais já existentes no servidor.

Para instalações que já estão na 0.2.0, use a [correção 0.2.1](correcao-integrador-0.2.1.md).

## Conteúdo

- Clientes novos e vínculos de vendedores: catálogo compartilhado da empresa 1, fila com retomada e revisão diária. Timer a cada cinco minutos, lote de 100 clientes. Não altera atribuições internas de vendedor/orçamentista.
- `fContratos`, `fFaturamento`, `fDevolucoesOutros`, `fDevolucoesCompra`: somente empresas **1, 2 e 27404**, conforme confirmação do usuário. A empresa 24571 presente no PBIX não é consultada.
- Coleta comercial completa paginada a cada hora após o término anterior; atualização atômica por empresa/tabela. Não há filtro incremental por data de emissão: alterações antigas e cancelamentos também precisam ser reconciliados.
- Dados originais em `m8_commercial_facts`, com chave empresa/tipo/ID e indicadores de presença. Quatro views com os nomes das tabelas do PBIX expõem os campos e regras de transformação. Linhas ausentes deixam de participar das views após uma coleta completa bem-sucedida; permanecem armazenadas para conferência.
- O integrador não escreve no ERP nem altera o PBIX. A aplicação web usa essas tabelas no módulo Comercial; veja [Projeção de vendas](projecao-vendas.md).

## Instalação no Ubuntu existente

Transfira `m8-integrador-0.2.1.tar.gz` e `m8-integrador-0.2.1.sha256` para o servidor. Verifique o checksum antes de extrair. Preserve `.env`, certificados e configuração local. Faça backup da pasta atual sem publicar esse backup, pois contém credenciais.

```bash
sha256sum -c m8-integrador-0.2.1.sha256
sudo systemctl stop m8-integrador.timer m8-equipamentos.timer m8-novas-os.timer m8-orcamentos.timer m8-compras.timer
# Aguarde as execuções em andamento concluírem antes de substituir arquivos.
systemctl list-units --type=service --state=running 'm8-*'
sudo tar -xzf m8-integrador-0.2.1.tar.gz -C /opt/m8-integrador
sudo chown -R m8-integrador:m8-integrador /opt/m8-integrador
cd /opt/m8-integrador
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run build
sudo -u m8-integrador npm run db:migrate
sudo cp deploy/systemd/m8-{orcamentos,compras,clientes,comercial}.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now m8-orcamentos.timer m8-compras.timer m8-clientes.timer m8-comercial.timer
# Reative também os timers anteriores que estavam habilitados na instalação.
sudo systemctl start m8-integrador.timer m8-equipamentos.timer m8-novas-os.timer
sudo -u m8-integrador npm run sync:commercial:status
journalctl -u m8-clientes.service -u m8-comercial.service -n 80 --no-pager
```

Caso o pacote anterior ainda não tenha sido instalado, confira também os pré-requisitos em `atualizacao-compras.md`. Timers inexistentes podem ser ignorados no comando de parada; não desabilite permanentemente serviços existentes. Não copie configurações de exemplo sobre o `.env` atual.

## Conferência

- A fila deve reduzir `never_checked` e manter `failures` em zero após completar a primeira carga.
- O status comercial deve apresentar 12 snapshots: quatro tabelas para cada uma das três empresas.
- Conferir contagens e valores das views com o PBIX usando o mesmo momento de atualização e excluindo a empresa 24571.
- Detalhes da extração e diferenças intencionais: `pbix-comercial.md`.

Em caso de falha de leitura ou paginação, o último snapshot daquela tabela/empresa é preservado e o processo retorna erro. Os demais snapshots podem concluir normalmente. Não houve instalação remota nem ativação de timers durante a preparação deste pacote.

## 0.2.2 — botão Sincronizar com ERP

A aplicação grava uma solicitação autenticada no banco; o integrador consulta a fila a cada 30 segundos. O processamento independe do navegador. Primeiro coleta contratos, faturamentos e devoluções (empresas 1, 2 e 27404); depois executa o ciclo das OS. Mantém locks e checkpoints existentes. Falhas são informadas na tela, sem afirmar sucesso parcial.

Após instalar o pacote 0.2.2 em /opt/m8-integrador, preservando .env e certificados:

```bash
cd /opt/m8-integrador
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run db:migrate
sudo cp deploy/systemd/m8-projecao-manual.service deploy/systemd/m8-projecao-manual.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now m8-projecao-manual.timer
sudo systemctl start m8-projecao-manual.service
systemctl list-timers --all m8-projecao-manual.timer --no-pager
```

Requer migrations 020 e 021. O botão fica indisponível sem heartbeat do integrador nos últimos dois minutos. Há apenas uma solicitação ativa global, limite de uma nova solicitação por minuto e cinco minutos de espera após sucesso. Os timers anteriores continuam funcionando. Se uma coleta automática possuir o lock, a solicitação pode falhar: aguarde o ciclo antes de solicitar novamente. Ao reiniciar, o worker marca solicitações interrompidas como falha, sem repeti-las silenciosamente.

```bash
sudo journalctl -u m8-projecao-manual.service -n 100 --no-pager
```

O novo serviço roda como m8-integrador, sem privilégios de root. A aplicação não executa comandos remotos nem recebe credenciais do ERP.
