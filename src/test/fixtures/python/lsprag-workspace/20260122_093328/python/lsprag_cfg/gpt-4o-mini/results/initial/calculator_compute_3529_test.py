import unittest
from math_utils import add, multiply
from calculator import Calculator

class Testcalculator_compute_3529_test(unittest.TestCase):
    
    def test_calculator_compute_3529_test_0(self):
        """
        GOAL : COVER BELOW CONDITION
        operation == "add"
        MAPPING (IMPORTANT):
        - This condition MUST be covered by a test whose function/method name starts with: test_calculator_compute_3529_test_0
        - You may optionally append a suffix after "__" (e.g. test_calculator_compute_3529_test_0__happyPath), but DO NOT change the prefix.
        """
        calc = Calculator()
        result = calc.compute("add", 2, 3)
        self.assertEqual(result, 5)  # 2 + 3 should equal 5
        
    def test_calculator_compute_3529_test_1(self):
        """
        GOAL : COVER BELOW CONDITION
        operation == "multiply"
        To cover the above condition, you need to cover below conditions:
        1. !(operation == "add")
        MAPPING (IMPORTANT):
        - This condition MUST be covered by a test whose function/method name starts with: test_calculator_compute_3529_test_1
        - You may optionally append a suffix after "__" (e.g. test_calculator_compute_3529_test_1__happyPath), but DO NOT change the prefix.
        """
        calc = Calculator()
        result = calc.compute("multiply", 2, 3)
        self.assertEqual(result, 6)  # 2 * 3 should equal 6

if __name__ == '__main__':
    unittest.main()