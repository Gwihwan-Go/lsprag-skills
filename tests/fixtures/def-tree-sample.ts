export const FOO_CONSTANT = 42;

export function foo() {
  const x = FOO_CONSTANT;
  return bar();
}

export const BAR_CONSTANT = "hello";

export function qux() {
  return BAR_CONSTANT;
}

export function bar() {
  const msg = BAR_CONSTANT;
  qux();
  return baz();
}

export function baz() {
  return 1;
}
