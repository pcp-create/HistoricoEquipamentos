# Organização dos módulos

A página inicial é o portal de módulos. Esta etapa organiza a navegação; não cria permissões por módulo.

| Módulo | Funções atuais |
| --- | --- |
| CRM | Orçamentos; acesso compartilhado ao histórico e catálogo |
| Assistência Técnica | Consulta de OS e peças; catálogo; acesso aos planos preventivos |
| Suprimentos | Análise e consulta de materiais, custos, estoque, similares e configuração do catálogo |
| Equipamentos | Cadastro, vínculo com clientes, frota, contratos e planos preventivos |

Histórico e catálogo são recursos compartilhados, com uma única base e tela. O histórico passa a /historico; links antigos com filtros na raiz são redirecionados preservando os parâmetros.

Administração (usuários, acesso, logs e integrações) e Configurações são áreas gerais. Administração mantém a regra de administrador existente.

Próxima etapa: permissões por usuário e módulo, com ações de consultar, editar e administrar verificadas nas APIs. Recursos compartilhados devem aceitar as permissões dos módulos autorizados, sem duplicar dados. A separação visual desta etapa não restringe os acessos existentes.

Os quatro módulos atendem ao escopo atual. Caso sejam incorporados conciliação bancária, DDA, contas a pagar/receber e caixa, recomenda-se um módulo Financeiro separado.
