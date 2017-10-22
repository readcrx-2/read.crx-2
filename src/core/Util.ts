namespace app.Util {
  export function levenshteinDistance (
    a:string,
    b:string,
    allowReplace:boolean = true
  ):number {
    var repCost:number, table:number[][], ac:number, bc:number;

    repCost = allowReplace ? 1 : 2;

    table = [[]];

    for (bc = 0; bc <= b.length; bc++) {
      table[0].push(bc);
    }

    for (ac = 1; ac <= a.length; ac++) {
      table[ac] = [ac];
    }

    for (ac = 1; ac <= a.length; ac++) {
      for (bc = 1; bc <= b.length; bc++) {
        table[ac][bc] = Math.min(
          table[ac - 1][bc] + 1,
          table[ac][bc - 1] + 1,
          table[ac - 1][bc - 1] + (a[ac - 1] === b[bc - 1] ? 0 : repCost)
        );
      }
    }

    return table[a.length][b.length];
  }
}
