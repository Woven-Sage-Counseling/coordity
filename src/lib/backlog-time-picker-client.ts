function to24HourTime(hour12: number, minute: number, period: string): string {
  let hours = hour12;
  if (period === 'AM') {
    hours = hour12 === 12 ? 0 : hour12;
  } else {
    hours = hour12 === 12 ? 12 : hour12 + 12;
  }
  return `${String(hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function syncTimePicker(container: HTMLElement): void {
  const hidden = container.querySelector('input[type="hidden"]') as HTMLInputElement | null;
  const hourSelect = container.querySelector('[data-time-hour]') as HTMLSelectElement | null;
  const minuteSelect = container.querySelector('[data-time-minute]') as HTMLSelectElement | null;
  const periodSelect = container.querySelector('[data-time-period]') as HTMLSelectElement | null;
  if (!hidden || !hourSelect || !minuteSelect || !periodSelect) return;

  hidden.value = to24HourTime(
    Number(hourSelect.value),
    Number(minuteSelect.value),
    periodSelect.value,
  );
}

export function resetTimePicker(container: HTMLElement): void {
  const hourSelect = container.querySelector('[data-time-hour]') as HTMLSelectElement | null;
  const minuteSelect = container.querySelector('[data-time-minute]') as HTMLSelectElement | null;
  const periodSelect = container.querySelector('[data-time-period]') as HTMLSelectElement | null;
  const daySelect = container.querySelector('[data-time-day]') as HTMLSelectElement | null;
  if (hourSelect) hourSelect.value = '12';
  if (minuteSelect) minuteSelect.value = '0';
  if (periodSelect) periodSelect.value = 'AM';
  if (daySelect) daySelect.value = container.dataset.initialNextDay === '1' ? '1' : '0';
  syncTimePicker(container);
}

export function initTimePicker(container: HTMLElement): void {
  if (container.dataset.timePickerReady === '1') {
    syncTimePicker(container);
    return;
  }
  container.dataset.timePickerReady = '1';
  syncTimePicker(container);
  container.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', () => syncTimePicker(container));
  });
}

export function initTimePickersIn(root: HTMLElement | Document): void {
  root.querySelectorAll('[data-backlog-time-picker]').forEach((node) => {
    if (node instanceof HTMLElement) initTimePicker(node);
  });
}
