# Acesso aos módulos por usuário

Administração → Usuários → Editar funcionário → Módulos disponíveis.

As marcações controlam os cartões, links, páginas e APIs. O perfil de administrador não concede automaticamente Programação de OSs ou Portal Técnico. Ações administrativas e regras de atribuição, responsáveis e equipe continuam sendo verificadas separadamente.

Módulos: CRM, Assistência Técnica, Suprimentos, Equipamentos, Tarefas, Programação de OSs e Portal Técnico. Telas compartilhadas (histórico, fabricante, equipamentos) ficam disponíveis quando ao menos um dos módulos associados estiver autorizado. Programação e Portal Técnico têm autorizações próprias.

A migração 048 mantém CRM, Assistência Técnica, Suprimentos, Equipamentos e Tarefas habilitados para cadastros existentes e novos. Programação e Portal Técnico começam desmarcados, inclusive para administradores; devem ser habilitados no cadastro. Administração de usuários continua restrita a administradores, como ferramenta de gestão de permissões.

Antes de publicar o código, aplicar:
```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-user-modules.mts
```
Execute dentro de web. A migração é registrada com checksum e não sobrescreve seleções posteriores. Após salvar permissões, reabra a página do usuário para atualizar o menu. As APIs verificam a permissão a cada requisição.
