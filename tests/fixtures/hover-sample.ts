// Fixture for testing hover/declaration routing in getDefinition

export const MAX_RETRIES = 5;
export const BASE_URL = "https://example.com";
export let counter = 0;
export var legacyFlag = true;

export function compute(x: number): number {
  const factor = MAX_RETRIES;
  counter += 1;
  return x * factor;
}

export function greet(name: string): string {
  return `Hello, ${name}! Base: ${BASE_URL}`;
}
