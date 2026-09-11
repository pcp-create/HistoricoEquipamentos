# Instalação Linux via SSH

Arquivos preparados para servidor com systemd, acesso sudo e Node.js 22 ou superior instalado em `/usr/bin/node`. A instalação e a transferência para o servidor ainda não foram executadas. O banco continua no Supabase; não instalar PostgreSQL no servidor.

## 1. Verificar o servidor

Na sessão SSH, executar e conferir os resultados:

```bash
cat /etc/os-release
ps -p 1 -o comm=
command -v node
node --version
npm --version
df -h /opt
free -h
```

O processo 1 deve ser `systemd`. Se Node.js estiver ausente ou em outro caminho, ajustar a instalação antes de continuar. O serviço não carrega o ambiente interativo do SSH nem o nvm. Não substituir a versão usada pelo outro integrador sem avaliar sua compatibilidade.

## 2. Transferir o projeto

Na raiz do projeto no ambiente atual, gerar um pacote sem credenciais, dependências ou logs:

```bash
tar -czf /tmp/m8-integrador.tar.gz package.json package-lock.json tsconfig.json tsconfig.build.json src supabase deploy
scp /tmp/m8-integrador.tar.gz USUARIO@SERVIDOR:/tmp/m8-integrador.tar.gz
```

Substituir `USUARIO@SERVIDOR` pelo acesso SSH real. No servidor, criar um usuário exclusivo sem login e uma pasta dedicada (se o usuário já existir, conferir sua configuração antes de reutilizar):

```bash
sudo useradd --system --user-group --home-dir /opt/m8-integrador --shell /usr/sbin/nologin m8-integrador
sudo install -d -o m8-integrador -g m8-integrador -m 750 /opt/m8-integrador
sudo -u m8-integrador tar -xzf /tmp/m8-integrador.tar.gz -C /opt/m8-integrador
```

Transferir `.env` e `prod-ca-2021.crt` separadamente pelo SSH/SFTP para uma pasta privada do usuário de acesso, nunca para repositório ou chat. No servidor, a partir dessa pasta:

```bash
sudo install -o m8-integrador -g m8-integrador -m 600 .env /opt/m8-integrador/.env
sudo install -o m8-integrador -g m8-integrador -m 644 prod-ca-2021.crt /opt/m8-integrador/prod-ca-2021.crt
```

Conferir no arquivo privado `M8_COMPANIES=1,2,27404`, `DATABASE_URL`, `M8_TIME_ZONE=America/Sao_Paulo` e `DATABASE_SSL_CA_FILE=prod-ca-2021.crt`. Usar a conexão e as credenciais já validadas. Acesso de saída necessário: HTTPS para M8 e PostgreSQL para o host/porta do Supabase. O integrador não precisa abrir uma porta de entrada.

## 3. Instalar e validar

```bash
cd /opt/m8-integrador
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run build
sudo -u m8-integrador npm run db:migrate
sudo -u m8-integrador npm run sync:status
sudo install -m 644 deploy/systemd/m8-integrador.service /etc/systemd/system/m8-integrador.service
sudo install -m 644 deploy/systemd/m8-integrador.timer /etc/systemd/system/m8-integrador.timer
sudo systemd-analyze verify /etc/systemd/system/m8-integrador.service /etc/systemd/system/m8-integrador.timer
sudo systemctl daemon-reload
```

## 4. Transferir a execução e ativar

Antes de iniciar no servidor, solicitar a parada do worker no ambiente atual com SIGTERM e aguardar sua saída. Conferir que o PID corresponde a `dist/scripts/syncCycle.js` antes de enviar o sinal. A fila e os dados concluídos permanecem no Supabase. Não executar o scanner antigo por IDs em paralelo.

```bash
sudo systemctl start --no-block m8-integrador.service
sudo systemctl enable --now m8-integrador.timer
```

O primeiro ciclo atualiza a lista de cabeçalhos e continua as OS pendentes; as já finalizadas como Processado não refazem os detalhes. Não é necessário esperar toda a carga inicial terminar para habilitar o timer.

O timer dispara uma hora após o término do serviço, inclusive após uma falha, e também agenda uma execução após o boot. Não é um horário fixo a cada hora: a duração da coleta se soma ao intervalo. O systemd não inicia uma segunda instância do mesmo serviço enquanto ele está ativo. Após reinicialização do servidor, a fila permite retomar o trabalho. O serviço oneshot pode aparecer como `activating` durante toda a coleta e `inactive` após o término; isso é esperado.

## 5. Acompanhar e parar

```bash
sudo journalctl -u m8-integrador.service -n 100 --no-pager
sudo journalctl -u m8-integrador.service -f
systemctl list-timers m8-integrador.timer
cd /opt/m8-integrador
sudo -u m8-integrador npm run sync:status
```

Ctrl+C encerra apenas o acompanhamento de logs. Para interromper o agendamento e a coleta:

```bash
sudo systemctl disable --now m8-integrador.timer
sudo systemctl stop m8-integrador.service
```

A parada aguarda até cinco minutos para concluir a OS atual; se o processo for encerrado antes, a transação e a fila permitem repetir a OS. Logs usam a retenção do journald do servidor; conferir a política existente sem alterá-la globalmente, pois o servidor hospeda outro integrador. Remover a cópia temporária das credenciais após validar a instalação.
