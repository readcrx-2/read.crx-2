export function levenshteinDistance (
  a: string,
  b: string,
  allowReplace: boolean = true
): number {
  const repCost = allowReplace ? 1 : 2;
  const table: Uint16Array[] = [];

  table[0] = new Uint16Array(b.length+1);
  for (let bc = 0; bc <= b.length; bc++) {
    table[0][bc] = bc;
  }

  for (let ac = 1; ac <= a.length; ac++) {
    table[ac] = new Uint16Array(b.length+1);
    table[ac][0] = ac;
  }

  for (let ac = 1; ac <= a.length; ac++) {
    for (let bc = 1; bc <= b.length; bc++) {
      table[ac][bc] = Math.min(
        table[ac - 1][bc] + 1,
        table[ac][bc - 1] + 1,
        table[ac - 1][bc - 1] + (a[ac - 1] === b[bc - 1] ? 0 : repCost)
      );
    }
  }

  return table[a.length][b.length];
}
