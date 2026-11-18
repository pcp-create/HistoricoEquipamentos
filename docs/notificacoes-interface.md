# Mensagens de ação

As telas web e os componentes embarcados no Portal Técnico usam ActionNotice para mensagens de erro e confirmação. Erros são vermelhos, permanecem até serem fechados e não descartam os dados preenchidos no formulário. Confirmações são verdes e desaparecem em três segundos. Uma nova mensagem reabre a notificação. ActionToast continua disponível quando o consumidor precisa controlar o fechamento explicitamente.

As mensagens são empilhadas em uma região inferior compartilhada. Dentro de diálogos, a região é criada na camada do diálogo para manter os botões acessíveis. Ações de tentar novamente continuam disponíveis dentro do popup. Fechar o popup não executa nem cancela a ação original.

Indicadores de carregamento, progresso de sincronização, estado de registros, pendências de sincronismo por item, alertas permanentes de garantia e orientações de preenchimento permanecem junto ao conteúdo. Eles não são confirmações transitórias de uma ação.

O APK 2.2.27 inclui a mesma apresentação no portal técnico, inclusive sem conexão.
