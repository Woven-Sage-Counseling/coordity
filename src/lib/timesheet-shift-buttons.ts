const PAGE_PROMINENT = 'btn-primary';
const PAGE_MUTED = 'btn-secondary cursor-not-allowed';
const WIDGET_BASE = 'w-full rounded-lg px-3 py-2 text-[11px] font-semibold';
const WIDGET_PROMINENT = `widget-accent-btn ${WIDGET_BASE}`;
const WIDGET_MUTED = `${WIDGET_BASE} border border-sage-dark/20 bg-white text-charcoal/55 cursor-not-allowed`;

export function shiftButtonClasses(onShift: boolean, role: 'start' | 'end', variant: 'page' | 'widget'): string {
  const prominent = variant === 'page' ? PAGE_PROMINENT : WIDGET_PROMINENT;
  const muted = variant === 'page' ? PAGE_MUTED : WIDGET_MUTED;
  const isProminent = role === 'start' ? !onShift : onShift;
  return isProminent ? prominent : muted;
}

export function applyShiftButtonState(
  startBtn: HTMLButtonElement | null,
  endBtn: HTMLButtonElement | null,
  activeShift: unknown,
  variant: 'page' | 'widget',
): void {
  const onShift = Boolean(activeShift);

  if (startBtn) {
    startBtn.disabled = onShift;
    startBtn.className = shiftButtonClasses(onShift, 'start', variant);
  }

  if (endBtn) {
    endBtn.disabled = !onShift;
    endBtn.className = shiftButtonClasses(onShift, 'end', variant);
  }
}
