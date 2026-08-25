export interface TimedEventRange {
  startMin: number;
  endMin: number;
}

export interface TimedEventLayout extends TimedEventRange {
  column: number;
  columnCount: number;
}

export function layoutOverlappingTimedEvents<T extends TimedEventRange>(
  events: T[],
): Array<T & TimedEventLayout> {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (left, right) => left.startMin - right.startMin || right.endMin - left.endMin,
  );

  const columns: number[] = [];
  const placed: Array<T & { column: number }> = [];

  for (const event of sorted) {
    let column = columns.findIndex((endMin) => endMin <= event.startMin);
    if (column === -1) {
      column = columns.length;
      columns.push(event.endMin);
    } else {
      columns[column] = event.endMin;
    }
    placed.push({ ...event, column });
  }

  return placed.map((event) => {
    const overlapping = placed.filter(
      (other) => other.startMin < event.endMin && event.startMin < other.endMin,
    );
    const columnCount = new Set(overlapping.map((other) => other.column)).size;
    return { ...event, columnCount: Math.max(columnCount, 1) };
  });
}

export function weekEventColumnStyle(column: number, columnCount: number): { left: string; width: string } {
  const widthPct = 100 / columnCount;
  const leftPct = column * widthPct;
  return {
    left: `calc(${leftPct}% + 1.5px)`,
    width: `calc(${widthPct}% - 3px)`,
  };
}
