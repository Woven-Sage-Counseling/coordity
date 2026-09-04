const PAGE_PROMINENT = 'btn-primary';
const PAGE_MUTED = 'btn-secondary cursor-not-allowed';
const WIDGET_BASE =
  'inline-flex w-full items-center justify-center whitespace-nowrap rounded-lg px-2 py-2 text-[11px] font-semibold leading-none';
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

  applyShiftStatus(activeShift);
}

export function applyShiftStatus(activeShift: unknown): void {
  document.querySelectorAll('[data-shift-status-self]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.onTimeOff === '1') return;
    if (node.dataset.showShiftStatus === '0') return;

    const onShift = Boolean(activeShift);
    node.dataset.onShift = onShift ? '1' : '0';

    const available = node.querySelector('[data-shift-status-available]');
    const unavailable = node.querySelector('[data-shift-status-unavailable]');
    const traveling = node.querySelector('[data-shift-status-traveling]');
    if (available instanceof HTMLElement) available.classList.toggle('hidden', !onShift);
    if (unavailable instanceof HTMLElement) unavailable.classList.toggle('hidden', onShift);
    if (traveling instanceof HTMLElement) traveling.classList.add('hidden');

    const label = node.querySelector('[data-shift-status-label]');
    if (label) label.textContent = onShift ? 'Available' : 'Unavailable';
  });
}
