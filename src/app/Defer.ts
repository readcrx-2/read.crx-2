export function defer (): Promise<void> {
  return new Promise( (resolve) => {
    setTimeout(resolve, 100);
  });
}

export function wait (ms: number): Promise<void> {
  return new Promise( (resolve) => {
    setTimeout(resolve, ms);
  });
}

export function wait5s (): Promise<void> {
  return new Promise( (resolve) => {
    setTimeout(resolve, 5 * 1000);
  });
}

export function waitAF (): Promise<void> {
  return new Promise( (resolve) => {
    requestAnimationFrame(<any>resolve);
  });
}
