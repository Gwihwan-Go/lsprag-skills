package main

import "fmt"

// Calculator holds a running value.
type Calculator struct {
	Value float64
}

// NewCalculator creates a Calculator with an initial value.
func NewCalculator(initial float64) *Calculator {
	return &Calculator{Value: initial}
}

// Add adds x to the calculator's value.
func (c *Calculator) Add(x float64) float64 {
	c.Value += x
	return c.Value
}

// Subtract subtracts x from the calculator's value.
func (c *Calculator) Subtract(x float64) float64 {
	c.Value -= x
	return c.Value
}

// Reset sets the calculator's value to zero.
func (c *Calculator) Reset() {
	c.Value = 0
}

// ComputeSum sums a slice of floats using a Calculator.
func ComputeSum(numbers []float64) float64 {
	calc := NewCalculator(0)
	for _, n := range numbers {
		calc.Add(n)
	}
	return calc.Value
}

func main() {
	result := ComputeSum([]float64{1.0, 2.0, 3.0})
	fmt.Printf("Sum: %f\n", result)

	calc := NewCalculator(10.0)
	calc.Subtract(3.0)
	calc.Add(5.0)
	fmt.Printf("Final: %f\n", calc.Value)
}
