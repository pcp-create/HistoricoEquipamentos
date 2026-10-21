# Revisão de escrita dos relatórios técnicos

Na revisão individual ou em sequência, **Revisar escrita com IA** envia apenas textos preenchidos, comentários e observações internas configurados no checklist. Fotos, assinaturas, campos de medição e seleções de status não são enviados. Textos podem conter dados do cliente escritos pelo técnico; a solicitação ocorre somente ao clicar no botão.

A resposta é exibida como sugestão, com original e proposta. O planejador aceita ou rejeita cada campo. Aceitar muda o rascunho: a gravação acontece no fluxo existente **Salvar ajustes**, com suas validações, controle de versão e histórico. Campos alterados enquanto a consulta está em andamento não podem receber uma sugestão baseada no texto anterior. Sugestões são temporárias e não fazem parte do PDF.

## Configuração no servidor

Definir no ambiente local (`web/.env.local`) e no provedor de hospedagem:

- `OPENAI_API_KEY`: chave de projeto OpenAI. Nunca usar prefixo `NEXT_PUBLIC_`, registrar no Git ou colocar no navegador.
- `OPENAI_REVIEW_MODEL`: opcional; padrão `gpt-4o-mini`. O modelo deve aceitar Responses API com Structured Outputs.

Reiniciar o servidor local ou fazer novo deploy após configurar. Sem chave, o botão informa que a integração ainda não está configurada. Nenhuma mudança de banco é necessária.

A integração usa [Responses API com Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), `store: false`, limite de saída e timeout de 45 segundos. Não usa ferramentas nem pesquisa externa. O endpoint exige sessão autenticada e mesma origem, verifica versão/status da operação e valida os campos contra o template persistido. Existe proteção contra consultas simultâneas por usuário na mesma instância; configure também limites de gastos do projeto no provedor (essa proteção não é um limite distribuído).

O prompt orienta reescrita profissional com vocabulário de manutenção de compressores, considerando título e textos relacionados da mesma etapa, sem modificar fatos, incertezas ou conclusões. Observações internas não devem ser transferidas aos campos destinados ao cliente. Exemplos e restrições estão em `lib/service-scheduling/review-writing-prompt.ts`. A validação rejeita respostas com campos desconhecidos, duplicados ou mudanças de números/códigos alfanuméricos. Isso não garante equivalência semântica: a comparação e aprovação humana continuam necessárias. Falhas, recusas ou respostas incompletas nunca substituem os textos.

## Verificação

- `node --conditions=react-server --import tsx --test tests/review-writing.test.ts`
- `npx playwright test tests/review-writing.spec.ts tests/order-operations-review.spec.ts`

Os testes usam respostas simuladas, não consomem a API nem transmitem relatórios reais.
