# Desativação e exclusão de funcionários

Na lista de funcionários, administradores podem desativar, reativar ou excluir um cadastro. Desativar bloqueia o acesso e mantém o funcionário visível para reativação. Excluir requer confirmação, bloqueia o acesso e retira o cadastro da lista, preservando a identidade no banco para manter OSs, tarefas, apontamentos e auditoria. O login não recria acesso para um e-mail excluído.

Não é permitido desativar/excluir o próprio cadastro nem remover o último administrador ativo. As ações são verificadas no servidor e registradas no log de acesso.

Antes de publicar a interface, aplicar `web/sql/095_employee_deletion.sql` no banco. A consulta da lista continua compatível com bancos sem a coluna; excluir exige a migration. Não é necessário novo APK.
