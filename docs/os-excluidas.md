# Reconciliação de OSs excluídas — integrador 0.2.6

A coleta `sync:new-orders` consulta a listagem completa resumida do M8 (Page=0, PageSize=0), por empresa, sem filtros de data ou status. Compara os IDs com as OSs locais e consulta individualmente cada candidata ausente. Lista vazia, malformada ou com erros não autoriza exclusões.

Uma candidata só recebe `Excluida` quando a consulta individual retorna HTTP 404/410 ou uma resposta válida sem registros. Timeout, 401/403, 429, 5xx e respostas divergentes deixam o registro intacto para nova tentativa no ciclo seguinte. Não interpretar qualquer erro como exclusão.

O registro e seus itens permanecem no banco e na tela de Ordens de Serviço; o filtro exibe “Excluída”. O status e a evidência (`payload._m8Deletion`, data de confirmação, data do inventário, motivo e status anterior) são gravados juntos. A OS deixa a fila de detalhes e a projeção de vendas. Documentos fiscais reais não são apagados. Parciais históricas já registradas permanecem como estavam.

Se a OS reaparecer numa listagem posterior, o status do ERP é restaurado, a marca de exclusão é retirada e os detalhes voltam para a fila. Respostas antigas de detalhes não podem sobrescrever uma exclusão confirmada. Registros locais atualizados após o início da consulta são preservados até o próximo ciclo.

## Instalação — Windows PowerShell → servidor Ubuntu

Use o mesmo acesso das atualizações anteriores: `root@187.77.36.214`. Se o endereço tiver mudado, ajuste a variável antes de enviar. Este roteiro atualiza a instalação existente em `/opt/m8-integrador`, preservando `.env` e certificados. Não exige migration nova para quem já está na versão 0.2.5.

### 1. Baixar os arquivos no Windows

Na pasta `artifacts` do projeto, baixe estes dois arquivos para **Downloads**, sem extrair e sem renomear:

- `m8-integrador-0.2.6.tar.gz`
- `m8-integrador-0.2.6.sha256`

O pacote ainda não foi publicado como release no GitHub. Use os arquivos disponibilizados no projeto.

### 2. Abrir o PowerShell

Abra o menu Iniciar, digite **PowerShell** e abra **Windows PowerShell**. Não precisa executar como administrador.

Cole:

```powershell
Set-Location "$env:USERPROFILE\Downloads"
Get-Item .\m8-integrador-0.2.6.tar.gz, .\m8-integrador-0.2.6.sha256
$esperadoM8 = ((Get-Content .\m8-integrador-0.2.6.sha256 -Raw).Trim() -split '\s+')[0]
$calculadoM8 = (Get-FileHash .\m8-integrador-0.2.6.tar.gz -Algorithm SHA256).Hash
if ($calculadoM8 -ne $esperadoM8) { throw 'Checksum diferente. Baixe os dois arquivos novamente.' }
Write-Host 'Pacote conferido: SHA256 OK' -ForegroundColor Green
```

Continue somente quando aparecer **Pacote conferido: SHA256 OK**. Evite arquivos com nomes terminados em `(1)`; os comandos usam os nomes exatos.

### 3. Enviar os arquivos ao servidor

Ainda no **PowerShell**, cole:

```powershell
$servidorM8 = '187.77.36.214'
$usuarioM8 = 'root'
ssh -F NUL "${usuarioM8}@${servidorM8}" "mkdir -p /root/m8-upload"
scp -F NUL .\m8-integrador-0.2.6.tar.gz .\m8-integrador-0.2.6.sha256 "${usuarioM8}@${servidorM8}:/root/m8-upload/"
```

Informe a senha quando solicitado. A senha não aparece ao digitar. Na primeira conexão, confira a identificação do servidor antes de aceitar a chave. Se houver erro no envio, resolva antes de continuar.

O `-F NUL` mantém o padrão anterior e contorna o problema de permissões do arquivo local `.ssh/config`. Caso seu acesso use outra porta ou chave, mantenha os parâmetros habituais (`-p` no SSH, `-P` no SCP, `-i` para a chave).

### 4. Entrar no servidor Ubuntu

Ainda no **PowerShell**:

```powershell
ssh -F NUL "${usuarioM8}@${servidorM8}"
```

Depois de entrar, o prompt será semelhante a `root@srv-integrador:~#`. **Todos os próximos comandos são executados nesse terminal Linux**, não diretamente no PowerShell.

### 5. Conferir o pacote no servidor

```bash
cd /root/m8-upload
sha256sum -c m8-integrador-0.2.6.sha256
node --version
id m8-integrador
test -f /opt/m8-integrador/.env && echo 'Configuração existente encontrada'
```

O checksum deve mostrar **OK**, o Node deve ser versão 22 ou superior, e a configuração existente deve ser encontrada. Se algum comando falhar, não prossiga para a instalação.

### 6. Pausar as coletas

Registre os timers ativos e pause-os:

```bash
systemctl list-units --type=timer --state=active --no-legend --plain 'm8-*.timer' | awk '{print $1}' > /root/m8-upload/timers-ativos-antes-0.2.6.txt
cat /root/m8-upload/timers-ativos-antes-0.2.6.txt
xargs -r systemctl stop < /root/m8-upload/timers-ativos-antes-0.2.6.txt
systemctl list-units --type=service --state=running,activating --no-pager 'm8-*'
```

Aguarde as coletas em execução terminarem. Repita o último comando até não haver serviços M8 executando. Se precisar interromper uma coleta demorada, use `systemctl stop NOME_DO_SERVICO` e aguarde a parada. Não substitua arquivos durante uma coleta.

### 7. Fazer backup

```bash
install -d -m 700 /root/m8-backups
backup_m8="/root/m8-backups/integrador-antes-0.2.6-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$backup_m8" -C /opt m8-integrador
chmod 600 "$backup_m8"
ls -lh "$backup_m8"
```

O backup contém configurações privadas e fica somente no servidor. Só continue após a conclusão sem erros.

### 8. Instalar a atualização

Execute um comando por vez. Se algum falhar, não prossiga para a ativação.

```bash
tar -xzf /root/m8-upload/m8-integrador-0.2.6.tar.gz -C /opt/m8-integrador
chown -R m8-integrador:m8-integrador /opt/m8-integrador
cd /opt/m8-integrador
sudo -u m8-integrador npm ci
node -p 'require("./package.json").version'
```

A versão deve ser **0.2.6**. O pacote já contém o código compilado: não é necessário `npm run build`. A extração preserva `.env` e certificados. Para atualização da 0.2.5, não é necessário executar migrations.

### 9. Atualizar o timer e retomar as coletas

```bash
cd /opt/m8-integrador
install -m 644 deploy/systemd/m8-novas-os.timer /etc/systemd/system/m8-novas-os.timer
systemctl daemon-reload
xargs -r systemctl start < /root/m8-upload/timers-ativos-antes-0.2.6.txt
systemctl enable --now m8-novas-os.timer
systemctl start --no-block m8-novas-os.service
systemctl list-timers --all 'm8-*.timer' --no-pager
```

São retomados os timers anteriormente ativos. O timer de cabeçalhos passa a disparar nos segundos **00 e 30**. O serviço existente `m8-novas-os.service` é mantido.

O systemd não sobrepõe execuções do mesmo serviço. Se uma coleta demorar mais de 30 segundos, ela termina antes do próximo início. A primeira reconciliação pode demorar mais por consultar individualmente as OSs antigas ausentes.

### 10. Validar os logs

```bash
systemctl is-active m8-novas-os.timer
journalctl -u m8-novas-os.service -n 100 --no-pager
```

O timer deve retornar **active**. Nos logs, procure `EXCLUSAO_OS` e `Reconciliação concluída`, com as quantidades de candidatas, exclusões confirmadas e falhas não confirmadas.

Para acompanhar ao vivo:

```bash
journalctl -fu m8-novas-os.service
```

Pressione **Ctrl+C** para sair apenas da visualização dos logs; isso não interrompe o serviço. Um serviço `oneshot` pode aparecer como `inactive (dead)` depois de concluir normalmente; confira `status=0/SUCCESS` e os logs.

Para sair do servidor e voltar ao PowerShell:

```bash
exit
```

### 11. Conferir na aplicação

A publicação da aplicação web é separada da instalação do integrador. Publique também a versão com as alterações dos filtros e da projeção. Após uma reconciliação concluída, as OSs confirmadas como excluídas aparecem em **Ordens de Serviço → Status da OS → Excluída** e deixam de entrar na projeção. Parciais históricas já salvas não são recalculadas.

Se ocorrer erro na instalação, preserve o backup e o arquivo `timers-ativos-antes-0.2.6.txt`. Os timers podem estar pausados; não considere a atualização concluída sem terminar a ativação e conferir os logs.

Gerar pacote: `node scripts/package-integrator.mjs`. Artefatos em `artifacts/m8-integrador-0.2.6.tar.gz` e respectivo SHA-256.
