export function rowDates(row: HTMLElement): {
  start: HTMLInputElement | null;
  end: HTMLInputElement | null;
} {
  return {
    start: row.querySelector('[data-time-off-start-date]'),
    end: row.querySelector('[data-time-off-end-date]'),
  };
}

export function isMultiDayRow(row: HTMLElement): boolean {
  const { start, end } = rowDates(row);
  return Boolean(start?.value && end?.value && end.value > start.value);
}

function timeInputs(row: HTMLElement): {
  times: HTMLElement | null;
  startTime: HTMLInputElement | null;
  endTime: HTMLInputElement | null;
} {
  return {
    times: row.querySelector('[data-time-off-times]'),
    startTime: row.querySelector('[data-time-off-start-time]'),
    endTime: row.querySelector('[data-time-off-end-time]'),
  };
}

function setElementHidden(element: HTMLElement | null, hidden: boolean): void {
  if (!element) return;
  element.classList.toggle('hidden', hidden);
  if (hidden) element.setAttribute('hidden', '');
  else element.removeAttribute('hidden');
}

function stashPartialTimes(row: HTMLElement): void {
  const { startTime, endTime } = timeInputs(row);
  if (startTime?.value) row.dataset.savedStartTime = startTime.value;
  if (endTime?.value) row.dataset.savedEndTime = endTime.value;
}

function restorePartialTimes(row: HTMLElement): void {
  const { startTime, endTime } = timeInputs(row);
  if (startTime && row.dataset.savedStartTime) {
    startTime.value = row.dataset.savedStartTime;
  }
  if (endTime && row.dataset.savedEndTime) {
    endTime.value = row.dataset.savedEndTime;
  }
}

function setPartialTimesEnabled(row: HTMLElement, enabled: boolean): void {
  const { times, startTime, endTime } = timeInputs(row);
  setElementHidden(times, !enabled);

  if (startTime) {
    startTime.disabled = !enabled;
    startTime.required = enabled;
    if (!enabled) {
      stashPartialTimes(row);
      startTime.value = '';
    }
  }

  if (endTime) {
    endTime.disabled = !enabled;
    endTime.required = enabled;
    if (!enabled) {
      endTime.value = '';
    }
  }

  if (enabled) {
    restorePartialTimes(row);
  }
}

export function syncTimeOffRow(row: HTMLElement): void {
  const fullDay = row.querySelector('[data-time-off-full-day]');
  const fullDayWrap = row.querySelector('[data-time-off-full-day-wrap]');
  const rangeNote = row.querySelector('[data-time-off-range-note]');
  const { start: startDate, end: endDate } = rowDates(row);

  if (startDate instanceof HTMLInputElement && endDate instanceof HTMLInputElement) {
    if (startDate.value && (!endDate.value || endDate.value < startDate.value)) {
      endDate.value = startDate.value;
    }
  }

  const multiDay = isMultiDayRow(row);
  setElementHidden(rangeNote instanceof HTMLElement ? rangeNote : null, !multiDay);
  setElementHidden(fullDayWrap instanceof HTMLElement ? fullDayWrap : null, multiDay);

  if (!(fullDay instanceof HTMLInputElement)) return;

  if (multiDay) {
    fullDay.checked = true;
    setPartialTimesEnabled(row, false);
    return;
  }

  const isFullDay = fullDay.checked;
  setPartialTimesEnabled(row, !isFullDay);
}

export function bindTimeOffRow(row: HTMLElement): void {
  const fullDay = row.querySelector('[data-time-off-full-day]');
  const { start, end } = rowDates(row);
  if (fullDay instanceof HTMLInputElement) {
    fullDay.addEventListener('change', () => syncTimeOffRow(row));
  }
  if (start instanceof HTMLInputElement) {
    start.addEventListener('change', () => syncTimeOffRow(row));
  }
  if (end instanceof HTMLInputElement) {
    end.addEventListener('change', () => syncTimeOffRow(row));
  }
  syncTimeOffRow(row);
}

export function prepareTimeOffFormForSubmit(form: HTMLFormElement): void {
  form.querySelectorAll('[data-time-off-row]').forEach((row) => {
    if (row instanceof HTMLElement) syncTimeOffRow(row);
  });
}
