# Cadastro completo de serviços e seleção geral no orçamento

A seleção de materiais usa `m8_product_catalog`. A seleção de serviços agora usa o cadastro completo de `/v1/estoque/servico`, inclusive serviços sem OS anterior. A migration 010 cria `m8_service_catalog`, protegida por RLS e sem acesso público. A coleta consulta as empresas 1, 2 e 27404 com Page=0/PageSize=0, preserva registros anteriores em respostas vazias e rejeita respostas inválidas.

A primeira carga já foi executada no Supabase. Para manter novos cadastros e preços atualizados no servidor, atualize o pacote abaixo. O timer existente `m8-produtos-catalog.timer` passa a coletar também serviços a cada ciclo; não há timer novo. Também é possível executar `npm run sync:services` isoladamente.

## Atualizar o servidor Ubuntu

Baixe `.m8/m8-integrador.tar.gz` atualizado em Downloads. No PowerShell do Windows:

```powershell
cd "$env:USERPROFILE\Downloads"
scp .\m8-integrador.tar.gz root@187.77.36.214:/root/m8-upload/
ssh root@187.77.36.214
```

No SSH, pause somente os integradores M8 para trocar os arquivos:

```bash
systemctl stop m8-integrador.timer m8-produtos-catalog.timer m8-produtos-available.timer m8-produtos-detail.timer m8-equipamentos.timer
systemctl stop m8-integrador.service m8-produtos@catalog.service m8-produtos@available.service m8-produtos@detail.service m8-equipamentos.service
cd /opt/m8-integrador
tar -xzf /root/m8-upload/m8-integrador.tar.gz -C /opt/m8-integrador
chown -R m8-integrador:m8-integrador /opt/m8-integrador
```

Execute em ordem; se um comando falhar, resolva antes de prosseguir. O pacote não contém `.env` nem certificados: os existentes são preservados.

```bash
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run build
sudo -u m8-integrador npm run db:migrate
sudo -u m8-integrador npm run sync:services
```

A migration 010 será reconhecida como já aplicada. Retome os agendamentos:

```bash
systemctl start m8-integrador.timer m8-produtos-catalog.timer m8-produtos-available.timer m8-produtos-detail.timer m8-equipamentos.timer
systemctl list-timers --all 'm8-*'
```

Para acompanhar as próximas coletas de produtos e serviços:

```bash
journalctl -u m8-produtos@catalog.service -n 40 --no-pager
```

## Uso no site

- **Filtrar materiais e serviços** filtra a lista existente imediatamente por nome/código, ignorando acentos e maiúsculas. Não busca novos produtos no ERP nem altera itens selecionados.
- **Adicionar material** e **Adicionar serviço** abrem o cadastro geral. Mostram 30 registros por página e pesquisam enquanto o usuário digita, inclusive com o campo vazio.
- As empresas são agrupadas pelo ID do produto/serviço. O cadastro da empresa 1 tem preferência; quando ausente, usa-se o primeiro disponível, identificado na origem.
- **Última venda · base geral** considera todas as empresas e clientes, com OS processadas e detalhes concluídos, na mesma unidade para materiais. Produtos nunca vendidos continuam disponíveis. Materiais excluídos não contam.
- A última venda geral, com cliente, OS, quantidade e valores, fica gravada como referência do item no rascunho. Selecionar não preenche o preço automaticamente: o usuário edita ou usa o botão de referência.
