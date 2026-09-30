# Pressure — Cabeçote PSV25AP

Catálogo técnico `PSV25 AP.pdf`, revisão 00, atualizado em junho/2014. Importação adicional em 30/09/2026, sem alterar a revisão ativa nem outras marcas e versões.

- 56 itens: 55 componentes e 1 kit completo (KIT027-373).
- 48 posições com referência de fabricante e 8 posições marcadas `#` na origem (11, 17, 32, 34, 40, 42, 47 e 49).
- As peças `#` são comuns de mercado e não comercializadas pela Pressure. Permanecem no catálogo sem código de vínculo; nenhum código M8 foi inferido por descrição.
- Quantidades, descrições, referências repetidas em diferentes posições e códigos da vista explodida foram preservados, com origem na página 3.
- Aplicação pelo modelo PSV25AP, cabeçote de alta pressão, 2 estágios, 175 PSI. Início de fabricação indicado: novembro/2002. A fonte cita AT32 250V, ON25 250V e SPART 25V; não informa faixa de série.
- Não há intervalo de manutenção informado. Os intervalos permanecem em branco, sem inventar periodicidades.
- A fonte diverge no volume de óleo AW150: 950 ml na página 2 e 650 ml na página 3. A ressalva consta nas condições da versão; não foi escolhido um volume para manutenção.

O catálogo pode ser consultado por **PSV25AP** ou **PSV25 AP**. A planilha padronizada `pressure-psv25ap.xlsx` contém Itens e Instruções. O relatório de conferência está em `pressure-psv25ap.report.json`. O original e uma cópia da extração ficam no arquivo privado `.m8/manufacturer/`, identificados pelo SHA-256.

## Reprodução

O extrator específico exige Python com PyMuPDF e confere as 56 posições conhecidas da revisão. A importação usa as tabelas e o padrão de revisões adicionais (`managed=true`) existentes, com transação e trava de concorrência. Repetir o mesmo PDF não duplica os itens.

Na pasta `web`, com `.env.local` configurado:

```bash
node --env-file=.env.local --conditions=react-server --import tsx scripts/import-pressure-psv25.mts '../PSV25 AP.pdf'
node --env-file=.env.local --conditions=react-server --import tsx scripts/import-pressure-psv25.mts '../PSV25 AP.pdf' --apply
```

Sem `--apply`, apenas prepara os arquivos e consulta se a revisão já existe. A planilha padronizada é para conferência; não deve ser enviada ao importador genérico, que exige referências e intervalos preenchidos. Não exige migration nem deploy para consultar os dados importados.
