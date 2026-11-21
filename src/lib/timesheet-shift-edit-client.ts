import { easternClockParts, easternDateFromMs } from './timesheet';
import { initTimePickersIn } from './backlog-time-picker-client';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function hourOptions(selected: number): string {
  return [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    .map(
      (hour) =>
        `<option value="${hour}" ${hour === selected ? 'selected' : ''}>${String(hour).padStart(2, '0')}</option>`,
    )
    .join('');
}

function minuteOptions(selected: number): string {
  return [0, 15, 30, 45]
    .map(
      (minute) =>
        `<option value="${minute}" ${minute === selected ? 'selected' : ''}>${String(minute).padStart(2, '0')}</option>`,
    )
    .join('');
}

function renderTimePicker(options: {
  name: string;
  label: string;
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
  showNextDay?: boolean;
  nextDay?: boolean;
}): string {
  const selectClass = 'field !mt-0 !w-[6.5rem] shrink-0';
  const periodClass = 'field !mt-0 !w-[7rem] shrink-0';
  const dayClass = 'field !mt-0 !w-[8.75rem] shrink-0';
  const nextDay = Boolean(options.nextDay);
  return `
    <label class="block shrink-0 text-sm">
      <span class="font-medium text-charcoal">${escapeHtml(options.label)}</span>
      <div
        class="mt-1.5 flex flex-wrap items-center gap-2"
        data-backlog-time-picker
        data-initial-next-day="${nextDay ? '1' : '0'}"
      >
        <input type="hidden" name="${escapeHtml(options.name)}" required />
        <select data-time-hour class="${selectClass}" aria-label="${escapeHtml(options.label)} hour">
          ${hourOptions(options.hour)}
        </select>
        <select data-time-minute class="${selectClass}" aria-label="${escapeHtml(options.label)} minute">
          ${minuteOptions(options.minute)}
        </select>
        <select data-time-period class="${periodClass}" aria-label="${escapeHtml(options.label)} AM or PM">
          <option value="AM" ${options.period === 'AM' ? 'selected' : ''}>AM</option>
          <option value="PM" ${options.period === 'PM' ? 'selected' : ''}>PM</option>
        </select>
        ${
          options.showNextDay
            ? `<select name="endedNextDay" data-time-day class="${dayClass}" aria-label="${escapeHtml(options.label)} day">
                <option value="0" ${!nextDay ? 'selected' : ''}>Same day</option>
                <option value="1" ${nextDay ? 'selected' : ''}>Next day</option>
              </select>`
            : ''
        }
      </div>
    </label>
  `;
}

/** Client-side twin of TimesheetShiftEditForm.astro — kept in sync for list re-renders. */
export function renderShiftEditControls(entry: Record<string, unknown>): string {
  const canRequestEdit = Boolean(entry.canRequestEdit);
  const startedAt = Number(entry.startedAt);
  const endedAt = Number(entry.endedAt);
  if (!canRequestEdit || !Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return '';
  }

  if (entry.hasPendingEdit) {
    return `<span class="text-xs font-semibold uppercase tracking-wide text-amber-800">Edit pending</span>`;
  }

  const shiftId = String(entry.id ?? '');
  const workDate = String(entry.workDate ?? '');
  const toggleId = `shift-edit-toggle-${shiftId}`;
  const startParts = easternClockParts(startedAt);
  const endParts = easternClockParts(endedAt);
  const endsNextDay = easternDateFromMs(startedAt) !== easternDateFromMs(endedAt);

  return `
    <input type="checkbox" id="${escapeHtml(toggleId)}" class="peer sr-only" />
    <label
      for="${escapeHtml(toggleId)}"
      class="inline-flex cursor-pointer items-center rounded-lg border border-sage-dark/15 bg-white px-2.5 py-1 text-xs font-medium text-sage-dark transition hover:border-sage-dark/30 hover:bg-sage/10 hover:text-charcoal peer-checked:border-sage-dark/30 peer-checked:bg-sage/15 peer-checked:text-charcoal"
    >
      Edit times
    </label>
    <div class="hidden w-full basis-full peer-checked:block">
      <form
        method="post"
        action="/api/timesheet/shift-edit"
        class="rounded-xl border border-sage-dark/10 bg-[#fafbf9] p-4"
        data-timesheet-shift-edit-form
      >
        <input type="hidden" name="returnTo" value="/timesheet" />
        <input type="hidden" name="shiftId" value="${escapeHtml(shiftId)}" />
        <p class="mb-4 text-sm text-sage-dark/70">
          Change clock-in or clock-out. Choose Next day if the shift went past midnight. The update is sent for the same approval as backlog hours.
        </p>
        <div class="flex max-w-lg flex-col gap-4">
          <label class="block text-sm">
            <span class="font-medium text-charcoal">Date</span>
            <input class="field mt-1.5 max-w-xs" name="workDate" type="date" value="${escapeHtml(workDate)}" required />
          </label>
          ${renderTimePicker({
            name: 'timeStarted',
            label: 'Clock in',
            hour: startParts.hour,
            minute: startParts.minute,
            period: startParts.period,
          })}
          ${renderTimePicker({
            name: 'timeEnded',
            label: 'Clock out',
            hour: endParts.hour,
            minute: endParts.minute,
            period: endParts.period,
            showNextDay: true,
            nextDay: endsNextDay,
          })}
          <label class="block text-sm">
            <span class="font-medium text-charcoal">Reason (optional)</span>
            <textarea
              class="field mt-1.5 min-h-[4.5rem]"
              name="notes"
              rows="2"
              placeholder="e.g. Forgot to clock in for the first 30 minutes"
            ></textarea>
          </label>
          <div class="flex flex-wrap items-center gap-3">
            <button class="btn-secondary !px-4 !py-2" type="submit">Submit for approval</button>
            <p
              class="hidden text-sm font-medium text-emerald-800"
              data-timesheet-shift-edit-success
              role="status"
              aria-live="polite"
            >
              Time change submitted.
            </p>
          </div>
        </div>
      </form>
    </div>
  `;
}

export function initShiftEditFormsIn(
  root: HTMLElement,
  onSubmit: (form: HTMLFormElement) => void,
): void {
  initTimePickersIn(root);
  root.querySelectorAll('[data-timesheet-shift-edit-form]').forEach((node) => {
    if (!(node instanceof HTMLFormElement)) return;
    if (node.dataset.bound === '1') return;
    node.dataset.bound = '1';
    node.addEventListener('submit', (event) => {
      event.preventDefault();
      onSubmit(node);
    });
  });
}
