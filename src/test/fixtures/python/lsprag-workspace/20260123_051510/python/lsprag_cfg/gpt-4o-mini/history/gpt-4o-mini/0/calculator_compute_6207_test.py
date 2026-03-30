import unittest
from calculator import Calculator  # Importing the Calculator class

class Testcalculator_compute_6207_test(unittest.TestCase):
    
    def setUp(self):
        """Create a Calculator instance for testing."""
        self.calculator = Calculator()

    def test_calculator_compute_6207_test_0(self):
        """
        GOAL : COVER BELOW CONDITION
        operation == "add"
        """
        result = self.calculator.compute("add", 2, 3)
        self.assertEqual(result, 5)  # Expecting 2 + 3 = 5

    def test_calculator_compute_6207_test_1(self):
        """
        GOAL : COVER BELOW CONDITION
        operation == "multiply"
        1. !(operation == "add")
        """
        result = self.calculator.compute("multiply", 4, 5)
        self.assertEqual(result, 20)  # Expecting 4 * 5 = 20

    def test_calculator_compute_invalid_operation(self):
        """
        GOAL : COVER BELOW CONDITION
        operation is neither "add" nor "multiply"
        """
        result = self.calculator.compute("subtract", 2, 3)  # Invalid operation
        self.assertEqual(result, 0)  # Expecting initial result, which is 0

if __name__ == '__main__':
    unittest.main()