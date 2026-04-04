"""Sample Python module for LSP integration testing."""


class Calculator:
    """A simple calculator class."""

    def __init__(self, initial: float = 0.0):
        self.value = initial

    def add(self, x: float) -> float:
        self.value += x
        return self.value

    def subtract(self, x: float) -> float:
        self.value -= x
        return self.value

    def reset(self) -> None:
        self.value = 0.0


def create_calculator(initial: float = 0.0) -> Calculator:
    """Factory function to create a Calculator."""
    return Calculator(initial)


def compute_sum(numbers: list[float]) -> float:
    """Compute sum using Calculator."""
    calc = create_calculator()
    for n in numbers:
        calc.add(n)
    return calc.value


def main():
    """Entry point."""
    result = compute_sum([1.0, 2.0, 3.0])
    print(f"Sum: {result}")

    calc = create_calculator(10.0)
    calc.subtract(3.0)
    calc.add(5.0)
    print(f"Final: {calc.value}")


if __name__ == "__main__":
    main()
