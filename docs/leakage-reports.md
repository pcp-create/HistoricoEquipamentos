# Relatórios de caça vazamentos

A tela `/caca-vazamento` possui as abas **Relatório**, **Máquinas e cálculo** e **Histórico**. O relatório impresso utiliza DM Sans, títulos Manrope, cabeçalho azul `#0c3d5d`, marca RJ e identificação da OS, seguindo os modelos de OS e análise de vibração. As páginas de pontos e a memória de cálculo repetem o cabeçalho. O formato continua A4 paisagem.

## Máquinas e memória de cálculo

Cada levantamento registra cliente, identificação, data opcional, OS, inspetor, localização, pressão da rede (bar), tarifa (R$/kWh), observações e até 100 compressores. Cada máquina informa identificação/modelo/série, potência em **kW**, vazão em **m³/min**, horas/dia e dias/ano. Unidades da planilha são mantidas: não há conversão automática de HP ou PCM.

As fórmulas compartilhadas entre aplicação e servidor ficam em `web/public/tools/leak-calculation.mjs`:

- PE unitário = kW ÷ (m³/min × 60), em kWh/m³.
- Horas anuais = horas/dia × dias/ano.
- Potência e vazão totais = soma das máquinas.
- PE configurado = **somatória dos PEs unitários**, conforme a célula de configuração da planilha fornecida.
- PE médio ponderado pela vazão = potência total ÷ (vazão total × 60), mostrado separadamente.
- Tempo equivalente anual = soma(PE unitário × horas anuais) ÷ soma(PE unitário).
- Tempo equivalente diário = tempo anual ÷ 365.

Não arredondamos resultados intermediários. Entradas incompletas ou denominadores nulos precisam ser corrigidos antes de salvar; o servidor recalcula os resultados e não aceita totais fornecidos pelo navegador.

A memória de cálculo é adicionada à impressão, com até dez máquinas por página. Os valores de configuração são identificados separadamente das informações do XML: **não alteram retroativamente os custos e resultados medidos pelo detector**. Informações ausentes no XML aparecem como não informadas.

## Histórico e imagens

`POST /api/leakage-reports` grava o levantamento completo: máquinas, parâmetros, XML e ajustes de texto. Fotos dos pontos e logo são enviadas separadamente, reprocessadas e armazenadas no banco. Ao reabrir, o relatório recupera os dados e as imagens, sem depender dos arquivos no computador original.

- As consultas e gravações exigem autenticação; POST exige mesma origem.
- Salvamentos usam versão otimista. Alterações concorrentes não sobrescrevem o trabalho de outro usuário.
- Cada salvamento gera uma revisão imutável. A seleção de uma revisão anterior abre uma cópia histórica; ao salvá-la, cria outro levantamento, preservando o original.
- **Salvar como novo** permite reutilizar a instalação como base de outro levantamento.
- O histórico é compartilhado pelos usuários autenticados, seguindo o módulo de relatórios de vibração.

O XML tem limite de 2 milhões de caracteres, e o projeto, de aproximadamente 3 MB. São permitidas até 500 imagens JPG/PNG/WebP, com até 3 MB por arquivo, redimensionadas para no máximo 1800 × 1800. O PDF continua sendo gerado pelo recurso de impressão do navegador.

## Instalação

Na aplicação web, com o banco configurado:

```bash
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-leakage-reports.mts
```

A migration `090_leakage_reports.sql` cria os levantamentos, revisões e imagens, com RLS e sem acesso público. Não é uma atualização do integrador.

## Importação da planilha fornecida

A aba **Calculadora** é um modelo genérico e não é importada como levantamento. As cinco abas nominais fornecidas contêm **17 máquinas**. Como a planilha não informa datas reais de inspeção, os cadastros importados permanecem sem data, com origem identificada e observação de importação.

```bash
python scripts/prepare-leak-calculator.py 'Calculadora Poder Especifico Caca Vazamentos.xlsx' > /tmp/leakage-base.json
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/import-leakage-base.mts /tmp/leakage-base.json
```

O leitor usa apenas células de entrada; não executa fórmulas ou macros. Os cálculos são refeitos pelo servidor. A combinação do hash do arquivo e do nome da aba impede duplicatas ao repetir a mesma importação. O arquivo original e o JSON temporário não devem ser publicados no repositório.

Cada máquina permite calcular as horas anuais por horas/dia × dias/ano ou informar diretamente as horas/ano (até 8.784). No modo direto, os campos diários não são exigidos. A escolha fica salva em cada versão e identificada na impressão. Cadastros anteriores continuam usando o cálculo diário.
