export function multiValSorter<T>(fn: (el: T) => GenericSortable[]) {
  return function (aObj: T, bObj: T) {
    const aVals = fn(aObj);
    const bVals = fn(bObj);

    for (const [idx, aVal] of aVals.entries()) {
      const bVal = bVals[idx];

      const sortVal = genericSorter(aVal, bVal);

      if (sortVal !== 0) {
        return sortVal;
      }
    }

    return 0;
  };
}

type GenericSortable = string | number | Date | null | undefined;

function genericSorter(a?: GenericSortable, b?: GenericSortable) {
  a ??= null;
  b ??= null;

  if (a === b) {
    return 0;
  }

  if (a === null) {
    return Infinity;
  }

  if (b === null) {
    return -Infinity;
  }

  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b);
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  throw new Error(
    `Cannot use keySorted on type "${typeof a}. Allowed types are string, number, Date, and null/undefined"`
  );
}
