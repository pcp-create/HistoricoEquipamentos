import unittest
from preventive_research import interval_candidates, estimate, number, checklist_readings

class ResearchTests(unittest.TestCase):
    def test_intervals_and_alternatives(self):
        for text in ['Preventiva 2.000 horas', 'preventiva 2000 horas', 'Manutenção 24.000 horas']:
            result=interval_candidates(text,'observacao')
            self.assertEqual(len(result),1)
            self.assertFalse(result[0]['review'])
        self.assertEqual(interval_candidates('Manutenção 24.000 horas','x')[0]['hours'],24000)
        result=interval_candidates('LUBRIFICADO PREVENTIVA A 2000 / 4000 HORAS','tipo')
        self.assertEqual([r['hours'] for r in result],[2000,4000])
        self.assertTrue(all(r['review'] for r in result))
        self.assertEqual(interval_candidates('Horímetro 12000 horas','x'),[])
        self.assertTrue(interval_candidates('Próxima preventiva 4000 horas','x')[0]['review'])
        self.assertTrue(interval_candidates('Não realizada manutenção 4000 horas','x')[0]['review'])
    def test_literal_interval_and_distant_planning(self):
        text = 'MANUTENÇÃO PREVENTIVA DE 38.000 HORAS EM COMPRESSOR.'
        result = interval_candidates(text, 'observacao')
        self.assertEqual(result[0]['hours'], 38000)
        self.assertEqual(result[0]['excerpt'], 'MANUTENÇÃO PREVENTIVA DE 38.000 HORAS')
        planned = 'MANUTENÇÃO PREVENTIVA DE 36.000 HORAS EM COMPRESSOR DE PARAFUSO. ESSA MANUTENÇÃO ESTÁ PREVISTA PARA NOVEMBRO/2024.'
        self.assertTrue(interval_candidates(planned, 'observacao')[0]['review'])

    def test_calendar_date_is_not_interval(self):
        self.assertEqual(interval_candidates('MANUTENÇÃO PROGRAMADA PARA 06/10/2026 HORARIO 8:30', 'observacao'), [])

    def test_estimate(self):
        def row(n,d):return {'value':n,'date':d,'review':False}
        result=estimate([row(1000,'2026-01-01'),row(1240,'2026-01-11')])
        self.assertEqual(result['calendarHoursDay'],24)
        self.assertIsNone(result['daysYear'])
        self.assertNotIn('calendarHoursDay',estimate([row(1000,'2026-01-01'),row(10,'2026-01-11')]))
        self.assertNotIn('calendarHoursDay',estimate([row(1000,'2026-01-01'),row(1500,'2026-01-11')]))
        self.assertNotIn('meter',estimate([row(1000,'2026-01-01'),row(1500,'2026-01-01')]))
        self.assertNotIn('meter',estimate([{'value':1,'date':'2026-01-01','review':True}]))
    def test_reading_not_service_interval(self):
        order={'service_order_items':[{'id':1,'name':'Preventiva 4000 horas','hours':4000,'number1':4000},{'id':2,'name':'Horímetro','number1': '12.345,5','number1_prefix':'Total','number2':100,'number2_prefix':'Carga'}]}
        readings=checklist_readings(order)
        self.assertEqual(len(readings),1)
        self.assertEqual(readings[0]['value'],12345.5)
        self.assertTrue(readings[0]['review'])
        self.assertIsNone(readings[0]['date'])
        self.assertIsNone(number('não informado'))

if __name__=='__main__': unittest.main()
