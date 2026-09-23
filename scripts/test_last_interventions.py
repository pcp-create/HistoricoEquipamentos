import unittest
from prepare_last_interventions import explicit_execution

class LastInterventionTests(unittest.TestCase):
    def evidence(self, text, reason='menção planejada/negada'):
        return dict(source='observacao',source_text=text,excerpt='MANUTENÇÃO PREVENTIVA DE 4.000 HORAS',reason=reason)

    def test_execution_with_approved_quote(self):
        self.assertTrue(explicit_execution(self.evidence('REALIZADO MANUTENÇÃO PREVENTIVA DE 4.000 HORAS, CONFORME ORÇAMENTO APROVADO.')))

    def test_not_executed_or_planned(self):
        for prefix in ['NÃO REALIZADO ', 'SERÁ REALIZADO ', 'ORÇAMENTO PARA ', 'PENDENTE, REALIZADO ']:
            self.assertFalse(explicit_execution(self.evidence(prefix+'MANUTENÇÃO PREVENTIVA DE 4.000 HORAS')))

    def test_alternative_interval_not_assumed(self):
        self.assertFalse(explicit_execution(self.evidence('REALIZADO MANUTENÇÃO PREVENTIVA DE 4.000 HORAS', 'intervalos alternativos')))
