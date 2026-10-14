# Primeiro acesso e reset de senha

- Novas contas precisam trocar a senha antes de acessar módulos ou APIs.
- Na migração 049, usuários que nunca efetuaram login ficam com troca obrigatória; quem já acessou mantém sua senha.
- Login com a senha temporária 123456 também ativa a troca obrigatória.
- Administração → Usuários → Editar funcionário → Conta de acesso → Resetar senha para 123456. A confirmação informa o efeito do reset.
- A tela solicita senha atual, nova senha e confirmação. A nova senha deve ter entre 6 e 128 caracteres, ser diferente da atual e de 123456.
- Após salvar, o usuário entra novamente com a nova senha.
- Contas bloqueadas continuam bloqueadas. O reset não altera perfil nem módulos.
- Senhas são processadas pela autenticação Supabase; eventos registram somente a ação e o usuário, sem senhas.
- A flag é controlada no servidor. Sessões já abertas deixam de acessar as APIs após reset e a verificação periódica direciona para a troca de senha.

Aplicar antes da publicação, dentro de web:
```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-password-change.mts
```

O script usa o registro de migrações para não reaplicar a inicialização dos usuários. A configuração de autenticação precisa aceitar a senha temporária de seis caracteres solicitada; falhas do provedor são exibidas sem informar sucesso.
