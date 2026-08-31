export interface PieSliceInput {
  label: string;
  minutes: number;
  percent: number;
  color: string;
  hoursLabel?: string;
}

export interface PieSlicePath extends PieSliceInput {
  path: string;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number) {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRadians),
    y: cy + radius * Math.sin(angleRadians),
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export function buildPieSlices(
  slices: PieSliceInput[],
  options: { size?: number; radius?: number } = {},
): PieSlicePath[] {
  const size = options.size ?? 220;
  const radius = options.radius ?? 88;
  const cx = size / 2;
  const cy = size / 2;
  let cursor = 0;

  return slices
    .filter((slice) => slice.minutes > 0)
    .map((slice) => {
      const sweep = (slice.percent / 100) * 360;
      const startAngle = cursor;
      const endAngle = cursor + sweep;
      cursor = endAngle;
      return {
        ...slice,
        path: describeArc(cx, cy, radius, startAngle, endAngle),
      };
    });
}
