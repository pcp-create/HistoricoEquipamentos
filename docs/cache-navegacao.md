# Cache de navegação

As consultas JSON das telas usam `apiFetch`, com cache por usuário autenticado e
aba do navegador. A validade é de 60 segundos (15 segundos para `/api/admin`).
Até 40 consultas/12 milhões de caracteres ficam em memória; um subconjunto de
até 2 milhões de caracteres fica em sessionStorage para navegação com recarga.
A navegação principal usa Link sem prefetch para manter o cache em memória sem
requisitar antecipadamente todas as telas. Sem identidade verificada não há cache.

Consultas simultâneas iguais compartilham a requisição. Cancelar um consumidor
não cancela os demais. Alterações via POST/PUT/DELETE invalidam o cache, assim como
login/logout e respostas 401/403. Respostas antigas em andamento não repovoam o
cache após invalidação. Credenciais e respostas de autenticação não são armazenadas.
Exportações e anexos não entram no cache; os controles de autorização continuam no
servidor. Atualização explícita ignora os dados anteriores. Mudanças feitas por
outra sessão são vistas na próxima consulta após expiração.

Tarefas e seus vínculos em equipamentos compartilham a sincronização em andamento
e reutilizam o resultado recente ao navegar. Atualizações periódicas de tarefas e
administração só executam com a tela visível. O cache não preserva formulários não
salvos nem substitui persistência no banco.
