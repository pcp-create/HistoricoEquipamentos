# Correção 0.2.1 para instalações 0.2.0

Corrige dois problemas confirmados após a primeira instalação:

- `ClienteDetailResponseDto` não retorna `id`. A identificação é a da rota consultada; validamos o objeto e os campos do cliente, e conferimos o ID se eventualmente existir. O snapshot anterior continua preservado em respostas inválidas. O status agora mostra os motivos agrupados das falhas.
- Os locks 81020/81021 já pertencem às rotinas de orçamentos/compras. Os quatro tipos comerciais agora usam 81030–81033, sem impedir a execução das rotinas anteriores.

A correção foi validada com quatro testes automatizados, typecheck/build e uma execução real: três clientes sincronizados sem falhas e 24 contratos coletados na empresa 1. Não há migrations novas nem mudanças de dependências.

O pacote `m8-integrador-0.2.1-correcao.tar.gz` destina-se somente a quem já instalou a 0.2.0. Contém os quatro módulos alterados (fontes e compilados), package.json/package-lock.json e este documento. Preserva configurações, certificados, tabelas e snapshots existentes. A coleta de clientes retoma a fila; erros anteriores serão tentados novamente após o intervalo já agendado de 15 minutos.

Depois de enviar pacote e checksum para `/root/m8-upload`, executar no servidor:

```bash
cd /root/m8-upload
sha256sum -c m8-integrador-0.2.1-correcao.sha256
# Continuar somente se retornar OK.
systemctl stop m8-clientes.timer m8-comercial.timer
systemctl stop m8-clientes.service m8-comercial.service
# Continuar somente se a parada concluir.
tar -xzf m8-integrador-0.2.1-correcao.tar.gz -C /opt/m8-integrador
chown -R m8-integrador:m8-integrador /opt/m8-integrador
systemctl reset-failed m8-clientes.service m8-comercial.service
systemctl start m8-clientes.timer m8-comercial.timer
systemctl start --no-block m8-clientes.service m8-comercial.service
journalctl -u m8-clientes.service -u m8-comercial.service --since '5 minutes ago' --no-pager
cd /opt/m8-integrador
sudo -u m8-integrador npm run sync:commercial:status
```

Não é necessário executar npm ci, build ou migrations para este pacote de correção, pois os compilados estão incluídos. Os demais timers continuam funcionando. A coleta interrompida de uma tabela comercial retoma do início daquela tabela, sem substituir seu snapshot por uma lista incompleta.
