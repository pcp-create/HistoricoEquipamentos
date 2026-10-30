# Atualização do integrador 0.2.5 — Windows → servidor Ubuntu

Este roteiro atualiza o servidor existente em `/opt/m8-integrador`, com o usuário de serviço `m8-integrador`. O pacote é cumulativo: inclui as correções anteriores e as migrations 001–024. Preserve o `.env` e os certificados existentes. A aplicação web é publicada separadamente.

**Padrão para próximas versões:** atualizar este arquivo junto com o pacote, incluindo download, nomes dos arquivos, verificação SHA256, comandos PowerShell, transferência, backup, instalação, ativação e validação no servidor. Não entregar apenas os comandos Linux.

## Novidades da versão 0.2.5

- Contratos: consulta paginada dos valores fixos e variáveis de cada contrato. A competência considera a soma das cobranças previstas, substituindo a divisão do total do cabeçalho pelo prazo.
- Exemplo validado: contrato 81, 36 parcelas; outubro e novembro com R$ 8.000,00 e dezembro em diante com R$ 6.500,00. Outubro já faturado: R$ 8.000,00, saldo zero. A instalação encerrada em 01/12 entra somente em outubro e novembro.
- Migration 024 atualiza a view `fContratos` para usar a mesma programação. Migrations 001–024 incluídas; a 023 mantém o controle de exclusão administrativa de parciais.
- As coletas fixas e variáveis precisam terminar antes de substituir os contratos da empresa. Regras e limitações do faturamento: [programação de cobranças](contract-charge-schedule.md).
- Após instalar, concluir a primeira coleta comercial nas três empresas. Não voltar a executar uma versão anterior do integrador, que gravaria cabeçalhos sem a programação de cobranças.

### Funcionalidades anteriores mantidas

- Cabeçalhos de OS novas e alteradas a cada minuto, mantendo o nome de serviço `m8-novas-os`. Atualiza entrega, situação, valores e demais campos presentes no resumo, preservando campos ausentes e rejeitando versões antigas.
- Comercial: cinco minutos após a conclusão da coleta anterior. Se uma coleta levar seis minutos, o próximo início será aproximadamente onze minutos após o anterior. Não há sobreposição de coletas comerciais.
- Detalhes: lotes de até 100 OS por empresa, com nova execução 30 segundos após terminar. Prioriza novas/alteradas e revisita diariamente as demais para capturar alterações apenas nos filhos. Uma OS com erro continua sujeita à retentativa.
- O botão manual atualiza cabeçalhos e dados comerciais, sem esperar produtos, serviços, apontamentos, anexos e demais detalhes.
- A aplicação web consulta a projeção a cada minuto enquanto a aba está visível e apresenta horários separados das OSs e dos dados comerciais.
- Pacote cumulativo, incluindo o processamento contínuo de clientes iniciais da versão 0.2.3.

A meta de atualização dos cabeçalhos é de 1–2 minutos em condições normais; não é garantia se o ERP estiver lento ou indisponível. A confirmação de coleta só avança após concluir todas as páginas/lotes da empresa.

## 1. Baixar para Downloads no Windows

Baixe os dois arquivos na [release Integrador M8 0.2.5](https://github.com/pcp-create/HistoricoEquipamentos/releases/tag/m8-integrador-v0.2.5), na seção **Assets**. Também é possível baixar pelo explorador de arquivos do projeto, na pasta `artifacts`:

- `m8-integrador-0.2.5.tar.gz`
- `m8-integrador-0.2.5.sha256`

Salve ambos em **Downloads**, sem extrair. Evite nomes com `(1)`; os comandos abaixo usam os nomes exatos.

## 2. Abrir o PowerShell e verificar o pacote

Execute no **Windows PowerShell**:

```powershell
Set-Location "$env:USERPROFILE\Downloads"
Get-Item .\m8-integrador-0.2.5.tar.gz, .\m8-integrador-0.2.5.sha256
$esperadoM8 = ((Get-Content .\m8-integrador-0.2.5.sha256 -Raw).Trim() -split '\s+')[0]
$calculadoM8 = (Get-FileHash .\m8-integrador-0.2.5.tar.gz -Algorithm SHA256).Hash
if ($calculadoM8 -ne $esperadoM8) { throw 'Checksum diferente. Baixe os dois arquivos novamente.' }
Write-Host 'Pacote conferido: SHA256 OK' -ForegroundColor Green
```

Só continue quando aparecer **SHA256 OK**.

## 3. Enviar pelo PowerShell

Substitua `IP_DO_SERVIDOR` pelo IP ou nome DNS utilizado no seu acesso SSH. O nome exibido no terminal, `srv-integrador`, não necessariamente é um endereço acessível pelo Windows.

```powershell
$servidorM8 = '187.77.36.214'
$usuarioM8 = 'root'
ssh -F NUL "${usuarioM8}@${servidorM8}" "mkdir -p /root/m8-upload"
scp -F NUL .\m8-integrador-0.2.5.tar.gz .\m8-integrador-0.2.5.sha256 "${usuarioM8}@${servidorM8}:/root/m8-upload/"
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
sha256sum -c m8-integrador-0.2.5.sha256
node --version
id m8-integrador
test -f /opt/m8-integrador/.env && echo 'Configuração existente encontrada'
```

O checksum deve retornar **OK**. O projeto requer Node.js 22 ou superior. Se algum comando falhar, pare antes de substituir arquivos. Não exiba nem compartilhe o conteúdo do `.env`.

## 6. Pausar as coletas e fazer backup

Registre quais timers estão ativos para restaurar a mesma configuração depois:

```bash
systemctl list-units --type=timer --state=active --no-legend --plain 'm8-*.timer' | awk '{print $1}' > /root/m8-upload/timers-ativos-antes-0.2.5.txt
cat /root/m8-upload/timers-ativos-antes-0.2.5.txt
xargs -r systemctl stop < /root/m8-upload/timers-ativos-antes-0.2.5.txt
systemctl list-units --type=service --state=running,activating --no-pager 'm8-*'
```

Parar timers não interrompe coletas já em andamento. **Aguarde os serviços terminarem** e repita o último comando até não haver coletas em execução. Não substitua o código enquanto elas executam. Se precisar interromper uma coleta demorada, use `systemctl stop NOME_DO_SERVICO` e aguarde a parada; não use `kill -9`.

Depois:

```bash
install -d -m 700 /root/m8-backups
backup_m8="/root/m8-backups/integrador-antes-0.2.5-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$backup_m8" -C /opt m8-integrador
chmod 600 "$backup_m8"
ls -lh "$backup_m8"
```

O backup contém configurações privadas: mantenha-o somente no servidor.

## 7. Instalar a atualização

Execute um comando por vez. **Se houver erro, não prossiga para a ativação.**

```bash
tar -xzf /root/m8-upload/m8-integrador-0.2.5.tar.gz -C /opt/m8-integrador
chown -R m8-integrador:m8-integrador /opt/m8-integrador
cd /opt/m8-integrador
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run db:migrate
node -p "require('./package.json').version"
```

A versão deve ser **0.2.5**. Os arquivos compilados já estão no pacote; não é necessário `npm run build`. A extração preserva o `.env` e os certificados, pois eles não fazem parte do pacote. Não substitua esses arquivos por exemplos.

As migrations já aplicadas são reconhecidas automaticamente. Não exclua tabelas nem altere migrations antigas se houver falha.

## 8. Ativar a sincronização solicitada pela tela

```bash
cd /opt/m8-integrador
cp deploy/systemd/m8-projecao-manual.service deploy/systemd/m8-projecao-manual.timer /etc/systemd/system/
cp deploy/systemd/m8-clientes.service deploy/systemd/m8-clientes.timer /etc/systemd/system/
cp deploy/systemd/m8-novas-os.service deploy/systemd/m8-novas-os.timer /etc/systemd/system/
cp deploy/systemd/m8-comercial.service deploy/systemd/m8-comercial.timer /etc/systemd/system/
cp deploy/systemd/m8-integrador.service deploy/systemd/m8-integrador.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now m8-novas-os.timer m8-comercial.timer m8-integrador.timer
systemctl start m8-novas-os.service
systemctl start --no-block m8-integrador.service m8-comercial.service
systemctl enable --now m8-clientes.timer
systemctl start --no-block m8-clientes.service
systemctl enable --now m8-projecao-manual.timer
systemctl start m8-projecao-manual.service
xargs -r systemctl start < /root/m8-upload/timers-ativos-antes-0.2.5.txt
systemctl list-timers --all 'm8-*.timer' --no-pager
```

O novo serviço roda como `m8-integrador`, consulta solicitações a cada 30 segundos e pode ficar **inactive (dead)** entre execuções: isso é normal para um serviço `oneshot`. O timer precisa estar ativo.

Este roteiro pressupõe que os serviços da versão anterior já estejam instalados. Ativa explicitamente as três rotinas de projeção acima; os demais timers anteriores mantêm sua configuração.

## 9. Validar no servidor e na tela

```bash
systemctl is-active m8-projecao-manual.timer
systemctl is-enabled m8-projecao-manual.timer
journalctl -u m8-projecao-manual.service -n 60 --no-pager
cd /opt/m8-integrador
sudo -u m8-integrador npm run sync:commercial:status
journalctl -u m8-comercial.service -n 60 --no-pager
```

Na aplicação com a versão atualizada:

1. Confira no log comercial a conclusão de `fContratos` nas empresas 1, 2 e 27404. A coleta dos itens de cada contrato aumenta o número de consultas ao M8.
2. Abra **Comercial → Projeção de Vendas**.
3. Aguarde até um minuto para o botão **Sincronizar com ERP** ficar disponível.
4. Clique uma vez. Deve aparecer **Aguardando integrador** e depois a etapa da coleta.
5. A solicitação continua mesmo fechando a página. Ao retornar, o andamento é consultado novamente.
6. Quando concluir, a tela aberta atualiza os valores. O tempo depende do volume e da resposta do ERP.

Na consulta de contratos de outubro/2026, valide o contrato **81**: **1/36**, parcela **R$ 8.000,00**, faturado **R$ 8.000,00** e saldo **R$ 0,00**. A aplicação web atualizada precisa estar publicada para usar o novo cálculo; o pacote contém apenas o integrador.

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

## O que a versão 0.2.5 acrescenta

A aplicação registra uma solicitação autenticada no banco. O integrador atualiza cabeçalhos de OS e coleta contratos (incluindo valores fixos e variáveis), faturamentos e devoluções das empresas **1, 2 e 27404**. Mantém os locks e checkpoints existentes. Falhas são informadas sem afirmar sucesso total. Os timers automáticos continuam funcionando normalmente.

A versão inclui as migrations 001–024, incluindo as parciais da projeção, a fila de sincronização manual e a programação de cobranças dos contratos. Não inclui aplicação web, PBIX, arquivos particulares, certificados ou credenciais.

## Conteúdo

- Clientes novos e vínculos de vendedores: catálogo compartilhado da empresa 1, fila com retomada e revisão diária. Timer a cada cinco minutos, lote de 100 clientes. Não altera atribuições internas de vendedor/orçamentista.
- `fContratos`, `fFaturamento`, `fDevolucoesOutros`, `fDevolucoesCompra`: somente empresas **1, 2 e 27404**, conforme confirmação do usuário. A empresa 24571 presente no PBIX não é consultada.
- Coleta comercial completa paginada cinco minutos após o término anterior; atualização atômica por empresa/tabela. Não há filtro incremental por data de emissão: alterações antigas e cancelamentos também precisam ser reconciliados.
- Dados originais em `m8_commercial_facts`, com chave empresa/tipo/ID e indicadores de presença. Quatro views com os nomes das tabelas do PBIX expõem os campos e regras de transformação. Linhas ausentes deixam de participar das views após uma coleta completa bem-sucedida; permanecem armazenadas para conferência.
- O integrador não escreve no ERP nem altera o PBIX. A aplicação web usa essas tabelas no módulo Comercial; veja [Projeção de vendas](projecao-vendas.md).

### Conferir a carga inicial de clientes

```bash
systemctl status m8-clientes.timer m8-clientes.service --no-pager
journalctl -u m8-clientes.service -n 100 -f
```

Durante a carga inicial, o serviço pode permanecer em execução por bastante tempo. Use Ctrl+C para sair dos logs sem parar o serviço. O resumo de quantidades é registrado ao concluir. O botão manual da tela não é necessário para essa carga.

## Aplicação web — registros de visita nas máquinas e fotos

Antes de publicar a aplicação web com esse recurso, aplicar `web/sql/077_visit_machine_records.sql` no banco da aplicação (já aplicada no ambiente conectado durante a implementação). Não faz parte do pacote do integrador. A visita realizada aceita registros por máquina integrada do cliente e até seis fotos JPG/PNG/WebP. As imagens são reduzidas no navegador, reprocessadas no servidor e armazenadas no banco; a consulta exige autenticação e acesso ao cliente. Os registros e fotos são gravados na mesma transação da visita. Cada máquina selecionada recebe um evento de visita em seu histórico.

O campo de observações do cadastro pendente de máquinas utiliza `web/sql/078_visit_machine_observations.sql`, também aplicada no ambiente conectado.

### Perfil Gestor — Gestão de Visitas

O perfil **Gestor** permite acessar a Gestão de Visitas, configurar suas finalidades, agendar visitas para vendedores e criar tarefas vinculadas às visitas da equipe. O perfil **Usuário** mantém o portal pessoal; somente gestores e administradores acessam a gestão. O gestor não recebe permissão para administrar usuários.

Esta etapa pertence à aplicação web e **não deve ser executada em `/opt/m8-integrador` no servidor do integrador**. O pacote `.tar.gz` não contém a pasta `web` nem o arquivo `.env.local`. Os erros `cd: web: No such file or directory` e `.env.local: not found` indicam que o comando foi executado no ambiente errado; não indicam falha na instalação do integrador.

A migration já foi aplicada ao banco conectado neste ambiente. Para esse mesmo banco, não é necessário repetir a etapa. Se estiver preparando outro banco, execute a partir da raiz do repositório completo, no ambiente da aplicação web com `web/.env.local` configurado:
```bash
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-visit-manager.mts
```

A migration `081_visit_manager_role.sql` habilita o perfil sem alterar o perfil de ninguém. Em **Administração → Usuários**, edite cada gestor, selecione **Perfil: Gestor** e salve. A migration já foi aplicada ao banco conectado neste ambiente.
