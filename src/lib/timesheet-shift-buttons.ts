const PAGE_PROMINENT = 'btn-primary';
const PAGE_MUTED = 'btn-secondary cursor-not-allowed';
const PAGE_PAUSE = 'btn-secondary';
const WIDGET_BASE =
  'inline-flex w-full items-center justify-center whitespace-nowrap rounded-lg px-2 py-2 text-[11px] font-semibold leading-none';
const WIDGET_PROMINENT = `widget-accent-btn ${WIDGET_BASE}`;
const WIDGET_MUTED = `${WIDGET_BASE} border border-sage-dark/20 bg-white text-charcoal/55 cursor-not-allowed`;
const WIDGET_PAUSE = `${WIDGET_BASE} border border-sage-dark/25 bg-white text-charcoal/80`;

type ActiveShiftLike = { onBreak?: boolean } | null | undefined;

export function shiftButtonClasses(onShift: boolean, role: 'start' | 'end', variant: 'page' | 'widget'): string {
  const prominent = variant === 'page' ? PAGE_PROMINENT : WIDGET_PROMINENT;
  const muted = variant === 'page' ? PAGE_MUTED : WIDGET_MUTED;
  const isProminent = role === 'start' ? !onShift : onShift;
  return isProminent ? prominent : muted;
}

export function pauseButtonClasses(onShift: boolean, variant: 'page' | 'widget'): string {
  if (!onShift) return variant === 'page' ? PAGE_MUTED : WIDGET_MUTED;
  return variant === 'page' ? PAGE_PAUSE : WIDGET_PAUSE;
}

export function applyShiftButtonState(
  startBtn: HTMLButtonElement | null,
  endBtn: HTMLButtonElement | null,
  activeShift: unknown,
  variant: 'page' | 'widget',
  pauseBtn: HTMLButtonElement | null = null,
): void {
  const onShift = Boolean(activeShift);
  const onBreak = Boolean((activeShift as ActiveShiftLike)?.onBreak);

  if (startBtn) {
    startBtn.disabled = onShift;
    startBtn.className = shiftButtonClasses(onShift, 'start', variant);
  }

  if (endBtn) {
    endBtn.disabled = !onShift;
    endBtn.className = shiftButtonClasses(onShift, 'end', variant);
  }

    if (pauseBtn) {
    pauseBtn.disabled = !onShift;
    pauseBtn.className = pauseButtonClasses(onShift, variant);
    pauseBtn.textContent = onBreak
      ? variant === 'widget'
        ? 'RESUME'
        : 'Resume'
      : variant === 'widget'
        ? 'PAUSE'
        : 'Pause';
    const form = pauseBtn.closest('form');
    if (form instanceof HTMLFormElement) {
      form.action = onBreak ? '/api/timesheet/resume-shift' : '/api/timesheet/pause-shift';
    }
  }

  applyShiftStatus(activeShift);
}

export function applyShiftStatus(activeShift: unknown): void {
  document.querySelectorAll('[data-shift-status-self]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.onTimeOff === '1') return;
    if (node.dataset.showShiftStatus === '0') return;

    const onShift = Boolean(activeShift);
    const onBreak = Boolean((activeShift as ActiveShiftLike)?.onBreak);
    const state = onBreak ? 'on_break' : onShift ? 'available' : 'unavailable';
    node.dataset.onShift = onShift ? '1' : '0';
    node.dataset.onBreak = onBreak ? '1' : '0';
    node.dataset.shiftState = state;

    const label = node.querySelector('[data-shift-status-label]');
    if (label) {
      label.textContent = onBreak ? 'On break' : onShift ? 'Available' : 'Unavailable';
    }
    const sr = node.querySelector('[data-shift-status-sr]');
    if (sr) {
      sr.textContent = onBreak
        ? 'Currently on break'
        : onShift
          ? 'Currently available'
          : 'Currently unavailable';
    }
  });
}
