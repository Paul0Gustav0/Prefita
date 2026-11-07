# Prefita · Gastos de Itaberá

Painel público para acompanhar para onde vai o dinheiro da Prefeitura e da Câmara de Itaberá (SP).

Tudo roda online: o GitHub Actions coleta os dados todo dia às 06:15 (horário de Brasília), salva o histórico neste repositório e publica o painel no GitHub Pages.

## Fontes

| Fonte | O que traz | Atualização |
|---|---|---|
| [TCE-SP, Portal da Transparência Municipal](https://transparencia.tce.sp.gov.br/apis) | Empenhos: fornecedor, CPF/CNPJ, nº do empenho, data, valor | O município envia ao Audesp uma vez por mês, com algumas semanas de atraso |
| [PNCP](https://pncp.gov.br/api/consulta/swagger-ui/index.html) | Contratos publicados pela Prefeitura (CNPJ 46.634.374/0001-60) | No dia da publicação |
| [Portal da Transparência da Prefeitura (Fiorilli)](https://fiorilli.itabera.online/transparencia/versaoJson/DadosAbertos/) | Empenhos com secretaria, área e fonte; folha nome a nome; diárias; licitações; contratos com saldo; receitas; emendas impositivas | No mesmo dia |
| [SICONFI (Tesouro)](https://apidatalake.tesouro.gov.br/docs/siconfi/) | Relatório de Gestão Fiscal: despesa com pessoal x limite da LRF | A cada quadrimestre |
| [Transferegov](https://api.transferegov.gestao.gov.br/transferenciasespeciais/) | Emendas parlamentares "Pix" recebidas pelo município | Quando o plano de ação é cadastrado |

## Estrutura

- `coletor/coletar.py`: baixa as fontes (só biblioteca padrão do Python). Meses já fechados não são baixados de novo; os 3 meses mais recentes são rebaixados todo dia.
- `coletor/fontes_extras.py`: portal da Prefeitura, SICONFI e Transferegov. O ano corrente é rebaixado todo dia. Como o portal só informa o total pago de cada empenho, a coleta compara com o dia anterior para mostrar os pagamentos novos (`site/data/pagamentos-recentes.json`).
- `site/js/prefita-base.js` e `site/js/secoes/*.js`: abas do painel (gastos do dia, folha, diárias, licitações e contratos, receitas, emendas).
- `dados/`: dados brutos, versionados, servem de histórico.
- `site/`: o painel (HTML estático) e `site/data/`, os arquivos já tratados que ele lê.
- `.github/workflows/coletar.yml`: agendamento diário e publicação.

## Pontos de atenção do painel

São sinais automáticos para orientar a consulta, não acusações:
- **Fracionamento?** 3 ou mais empenhos do mesmo fornecedor no mesmo mês, cada um abaixo do limite de dispensa (R$ 62.725,59), que somados passam dele.
- **Concentração**: fornecedor com mais de 5% do total empenhado no período.
- **Fora do padrão**: empenho acima de R$ 20 mil e mais de 3 vezes o valor típico daquele fornecedor.
