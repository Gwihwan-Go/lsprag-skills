/** Sample TypeScript module for LSP integration testing. */

interface Shape {
  area(): number;
  perimeter(): number;
}

class Circle implements Shape {
  constructor(public radius: number) {}

  area(): number {
    return Math.PI * this.radius * this.radius;
  }

  perimeter(): number {
    return 2 * Math.PI * this.radius;
  }
}

class Rectangle implements Shape {
  constructor(public width: number, public height: number) {}

  area(): number {
    return this.width * this.height;
  }

  perimeter(): number {
    return 2 * (this.width + this.height);
  }
}

function createShape(type: string, ...args: number[]): Shape {
  if (type === "circle") {
    return new Circle(args[0]);
  }
  return new Rectangle(args[0], args[1]);
}

function totalArea(shapes: Shape[]): number {
  let sum = 0;
  for (const shape of shapes) {
    sum += shape.area();
  }
  return sum;
}

function main(): void {
  const circle = createShape("circle", 5);
  const rect = createShape("rect", 3, 4);
  const shapes = [circle, rect];
  const total = totalArea(shapes);
  console.log(`Total area: ${total}`);
}

export { Shape, Circle, Rectangle, createShape, totalArea, main };
