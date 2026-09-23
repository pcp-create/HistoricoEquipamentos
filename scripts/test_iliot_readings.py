import unittest
from prepare_iliot_readings import meter
class MeterTests(unittest.TestCase):
 def test_formats(self):
  self.assertEqual(meter('140216'),140216)
  self.assertEqual(meter('43.587'),43587)
  self.assertEqual(meter('12.345,5'),12345.5)
  self.assertEqual(meter('12,5'),12.5)
  self.assertEqual(meter('12.5'),12.5)
  self.assertEqual(meter('0'),0)
  for value in ('n.c','.',None,'','1e6','-10','12 horas','10/20'):
   self.assertIsNone(meter(value))
if __name__=='__main__':unittest.main()
