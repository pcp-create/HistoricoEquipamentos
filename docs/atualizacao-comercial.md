# Atualização do integrador 0.2.2 — Windows → servidor Ubuntu

Este roteiro atualiza o servidor existente em `/opt/m8-integrador`, com o usuário de serviço `m8-integrador`. O pacote é cumulativo: inclui as correções anteriores e as migrations 001–021. Preserve o `.env` e os certificados existentes. A aplicação web é publicada separadamente.

**Padrão para próximas versões:** atualizar este arquivo junto com o pacote, incluindo download, nomes dos arquivos, verificação SHA256, comandos PowerShell, transferência, backup, instalação, ativação e validação no servidor. Não entregar apenas os comandos Linux.

## 1. Baixar para Downloads no Windows

No explorador de arquivos do projeto, abra `artifacts`, clique com o botão direito em cada arquivo e escolha **Download**:

- `m8-integrador-0.2.2.tar.gz`
- `m8-integrador-0.2.2.sha256`

Salve ambos em **Downloads**, sem extrair. Evite nomes com `(1)`; os comandos abaixo usam os nomes exatos.

## 2. Abrir o PowerShell e verificar o pacote

Execute no **Windows PowerShell**:

```powershell
Set-Location "$env:USERPROFILE\Downloads"
Get-Item .\m8-integrador-0.2.2.tar.gz, .\m8-integrador-0.2.2.sha256
$esperadoM8 = ((Get-Content .\m8-integrador-0.2.2.sha256 -Raw).Trim() -split '\s+')[0]
$calculadoM8 = (Get-FileHash .\m8-integrador-0.2.2.tar.gz -Algorithm SHA256).Hash
if ($calculadoM8 -ne $esperadoM8) { throw 'Checksum diferente. Baixe os dois arquivos novamente.' }
Write-Host 'Pacote conferido: SHA256 OK' -ForegroundColor Green
```

Só continue quando aparecer **SHA256 OK**.

## 3. Enviar pelo PowerShell

Substitua `IP_DO_SERVIDOR` pelo IP ou nome DNS utilizado no seu acesso SSH. O nome exibido no terminal, `srv-integrador`, não necessariamente é um endereço acessível pelo Windows.

```powershell
$servidorM8 = 'IP_DO_SERVIDOR'
$usuarioM8 = 'root'
ssh -F NUL "${usuarioM8}@${servidorM8}" "mkdir -p /root/m8-upload"
scp -F NUL .\m8-integrador-0.2.2.tar.gz .\m8-integrador-0.2.2.sha256 "${usuarioM8}@${servidorM8}:/root/m8-upload/"
```

O parâmetro `-F NUL` ignora o arquivo local `.ssh/config`, contornando o erro de permissões encontrado anteriormente. Use o endereço real do servidor, não um apelido definido nesse arquivo. Se seu acesso exige porta específica ou chave, acrescente `-p PORTA` no `ssh`, `-P PORTA` no `scp` e `-i CAMINHO_DA_CHAVE` em ambos. Não altere o método de autenticação do servidor.

Na primeira conexão, confira a identificação do servidor antes de aceitar a chave. A senha digitada não aparece na tela, o que é normal.

## 4. Entrar no servidor

Ainda no **PowerShell**:

```powershell
ssh -F NUL "${usuarioM8}@${servidorM8}"
```

Os próximos comandos são executados no **terminal Linux**, cujo prompt será semelhante a `root@srv-integrador:~#`. Não execute os blocos Linux diretamente no PowerShell.

## 5. Conferir os arquivos no servidor

```bash
cd /root/m8-upload
sha256sum -c m8-integrador-0.2.2.sha256
node --version
id m8-integrador
test -f /opt/m8-integrador/.env && echo 'Configuração existente encontrada'
```

O checksum deve retornar **OK**. O projeto requer Node.js 22 ou superior. Se algum comando falhar, pare antes de substituir arquivos. Não exiba nem compartilhe o conteúdo do `.env`.

## 6. Pausar as coletas e fazer backup

Registre quais timers estão ativos para restaurar a mesma configuração depois:

```bash
systemctl list-units --type=timer --state=active --no-legend --plain 'm8-*.timer' | awk '{print $1}' > /root/m8-upload/timers-ativos-antes-0.2.2.txt
cat /root/m8-upload/timers-ativos-antes-0.2.2.txt
xargs -r systemctl stop < /root/m8-upload/timers-ativos-antes-0.2.2.txt
systemctl list-units --type=service --state=running,activating --no-pager 'm8-*'
```

Parar timers não interrompe coletas já em andamento. **Aguarde os serviços terminarem** e repita o último comando até não haver coletas em execução. Não substitua o código enquanto elas executam. Se precisar interromper uma coleta demorada, use `systemctl stop NOME_DO_SERVICO` e aguarde a parada; não use `kill -9`.

Depois:

```bash
install -d -m 700 /root/m8-backups
backup_m8="/root/m8-backups/integrador-antes-0.2.2-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$backup_m8" -C /opt m8-integrador
chmod 600 "$backup_m8"
ls -lh "$backup_m8"
```

O backup contém configurações privadas: mantenha-o somente no servidor.

## 7. Instalar a atualização

Execute um comando por vez. **Se houver erro, não prossiga para a ativação.**

```bash
tar -xzf /root/m8-upload/m8-integrador-0.2.2.tar.gz -C /opt/m8-integrador
chown -R m8-integrador:m8-integrador /opt/m8-integrador
cd /opt/m8-integrador
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run db:migrate
node -p "require('./package.json').version"
```

A versão deve ser **0.2.2**. Os arquivos compilados já estão no pacote; não é necessário `npm run build`. A extração preserva o `.env` e os certificados, pois eles não fazem parte do pacote. Não substitua esses arquivos por exemplos.

As migrations já aplicadas são reconhecidas automaticamente. Não exclua tabelas nem altere migrations antigas se houver falha.

## 8. Ativar a sincronização solicitada pela tela

```bash
cd /opt/m8-integrador
cp deploy/systemd/m8-projecao-manual.service deploy/systemd/m8-projecao-manual.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now m8-projecao-manual.timer
systemctl start m8-projecao-manual.service
xargs -r systemctl start < /root/m8-upload/timers-ativos-antes-0.2.2.txt
systemctl list-timers --all 'm8-*.timer' --no-pager
```

O novo serviço roda como `m8-integrador`, consulta solicitações a cada 30 segundos e pode ficar **inactive (dead)** entre execuções: isso é normal para um serviço `oneshot`. O timer precisa estar ativo.

Este roteiro pressupõe que os serviços da versão anterior já estejam instalados. Não ativa automaticamente timers antigos que você havia desativado de propósito.

## 9. Validar no servidor e na tela

```bash
systemctl is-active m8-projecao-manual.timer
systemctl is-enabled m8-projecao-manual.timer
journalctl -u m8-projecao-manual.service -n 60 --no-pager
cd /opt/m8-integrador
sudo -u m8-integrador npm run sync:commercial:status
```

Na aplicação com a versão atualizada:

1. Abra **Comercial → Projeção de Vendas**.
2. Aguarde até um minuto para o botão **Sincronizar com ERP** ficar disponível.
3. Clique uma vez. Deve aparecer **Aguardando integrador** e depois a etapa da coleta.
4. A solicitação continua mesmo fechando a página. Ao retornar, o andamento é consultado novamente.
5. Quando concluir, a tela aberta atualiza os valores. O tempo depende do volume e da resposta do ERP.

Para acompanhar o processamento no servidor:

```bash
journalctl -u m8-projecao-manual.service -f
```

Pressione **Ctrl+C** para sair apenas da visualização dos logs; isso não interrompe o serviço. Para sair do servidor e voltar ao PowerShell, execute `exit`.

## 10. Se o botão continuar indisponível ou ocorrer falha

- Confira se a aplicação web atualizada foi publicada; instalar o integrador não publica a aplicação.
- O botão depende de um sinal de vida do serviço nos últimos dois minutos.
- Há uma solicitação global por vez; após sucesso, espere cinco minutos para solicitar outra.
- Se um timer automático estiver coletando os mesmos dados, o lock pode impedir a coleta manual. Aguarde a rotina e tente novamente.
- Verifique `journalctl -u m8-projecao-manual.service -n 100 --no-pager`. Não envie credenciais junto dos logs.
- Se a instalação falhar, preserve o backup e o arquivo de timers ativos. Não restaure arquivos sobre serviços em execução nem tente desfazer migrations apagando tabelas.

## O que a versão 0.2.2 acrescenta

A aplicação registra uma solicitação autenticada no banco. O integrador coleta contratos, faturamentos e devoluções das empresas **1, 2 e 27404**, e depois atualiza as OS. Mantém os locks e checkpoints existentes. Falhas são informadas sem afirmar sucesso total. Os timers automáticos continuam funcionando normalmente.

A versão inclui as migrations 020 (parciais imutáveis da projeção) e 021 (fila de sincronização manual). Não inclui aplicação web, PBIX, arquivos particulares, certificados ou credenciais.

## Conteúdo

- Clientes novos e vínculos de vendedores: catálogo compartilhado da empresa 1, fila com retomada e revisão diária. Timer a cada cinco minutos, lote de 100 clientes. Não altera atribuições internas de vendedor/orçamentista.
- `fContratos`, `fFaturamento`, `fDevolucoesOutros`, `fDevolucoesCompra`: somente empresas **1, 2 e 27404**, conforme confirmação do usuário. A empresa 24571 presente no PBIX não é consultada.
- Coleta comercial completa paginada a cada hora após o término anterior; atualização atômica por empresa/tabela. Não há filtro incremental por data de emissão: alterações antigas e cancelamentos também precisam ser reconciliados.
- Dados originais em `m8_commercial_facts`, com chave empresa/tipo/ID e indicadores de presença. Quatro views com os nomes das tabelas do PBIX expõem os campos e regras de transformação. Linhas ausentes deixam de participar das views após uma coleta completa bem-sucedida; permanecem armazenadas para conferência.
- O integrador não escreve no ERP nem altera o PBIX. A aplicação web usa essas tabelas no módulo Comercial; veja [Projeção de vendas](projecao-vendas.md).
