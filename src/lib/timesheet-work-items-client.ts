type WorkCategory = { key: string; label: string; color: string };
type WorkItem = { category: string; label: string; color: string; hoursLabel: string; minutes: number };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatHoursInput(minutes: number): string {
  if (minutes <= 0) return '';
  return (minutes / 60).toFixed(2).replace(/\.?0+$/, '');
}

function categoryOptions(categories: WorkCategory[], selected = ''): string {
  return categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category.key)}"${category.key === selected ? ' selected' : ''}>${escapeHtml(category.label)}</option>`,
    )
    .join('');
}

function workItemRow(categories: WorkCategory[], item?: WorkItem, showRemove = false): string {
  return `
    <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]" data-work-items-row>
      <label class="block text-xs">
        <span class="font-medium text-charcoal">Category</span>
        <select name="category" class="mt-1 w-full rounded-lg border border-sage-dark/15 bg-white px-2.5 py-2 text-sm text-charcoal">
          <option value="">Select…</option>
          ${categoryOptions(categories, item?.category ?? '')}
        </select>
      </label>
      <label class="block text-xs">
        <span class="font-medium text-charcoal">Hours</span>
        <input
          name="hours"
          type="text"
          inputmode="decimal"
          placeholder="1.5"
          value="${escapeHtml(formatHoursInput(item?.minutes ?? 0))}"
          class="mt-1 w-full rounded-lg border border-sage-dark/15 bg-white px-2.5 py-2 text-sm text-charcoal"
        />
      </label>
      <div class="flex items-end">
        <button
          type="button"
          class="rounded-lg px-2 py-2 text-xs text-sage-dark/70 hover:bg-white hover:text-charcoal${showRemove ? '' : ' hidden'}"
          data-work-items-remove
        >
          Remove
        </button>
      </div>
    </div>
  `;
}

export function renderWorkItemsSection(
  entry: Record<string, unknown>,
  categories: WorkCategory[],
): string {
  const canEdit = Boolean(entry.canEditWorkItems);
  const workItems = (entry.workItems as WorkItem[] | undefined) ?? [];
  const minutes = Number(entry.minutes ?? 0);
  const shiftId = String(entry.id ?? '');

  const chips =
    workItems.length > 0
      ? workItems
          .map(
            (item) => `
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-charcoal ring-1 ring-black/[0.08]"
              style="background-color: ${item.color}18"
            >
              <span class="size-1.5 rounded-full" style="background-color: ${item.color}"></span>
              ${escapeHtml(item.label)} · ${escapeHtml(item.hoursLabel)}
            </span>
          `,
          )
          .join('')
      : `<p class="text-xs text-sage-dark/60" data-work-items-empty>${canEdit ? 'No work items added yet.' : '—'}</p>`;

  const rows =
    workItems.length > 0
      ? workItems.map((item, index) => workItemRow(categories, item, index > 0 || workItems.length > 1)).join('')
      : workItemRow(categories);

  const unallocatedMinutes = Number(entry.unallocatedMinutes ?? 0);
  const maxHours = escapeHtml(String(entry.hoursLabel ?? ''));

  return `
    <div
      class="mt-3 border-t border-sage-dark/10 pt-3"
      data-shift-work-items
      data-shift-id="${escapeHtml(shiftId)}"
      data-shift-minutes="${minutes}"
      data-work-items='${escapeHtml(JSON.stringify(workItems))}'
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-semibold uppercase tracking-[0.12em] text-sage-dark/55">Work items</p>
        ${
          canEdit
            ? `<button type="button" class="text-xs font-medium text-sage-dark hover:text-charcoal" data-work-items-toggle>${workItems.length > 0 ? 'Edit items' : 'Add items'}</button>`
            : ''
        }
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5" data-work-items-list>${chips}</div>
      ${
        canEdit
          ? `
        <form
          class="mt-3 hidden rounded-xl border border-sage-dark/10 bg-[#f8f9fb] p-3"
          data-work-items-form
          action="/api/timesheet/work-items"
          method="post"
        >
          <input type="hidden" name="shiftId" value="${escapeHtml(shiftId)}" />
          <p class="text-xs text-sage-dark/70">Allocate hours across categories (max ${maxHours} for this shift).</p>
          <div class="mt-3 space-y-2" data-work-items-rows>${rows}</div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" class="text-xs font-medium text-sage-dark hover:text-charcoal" data-work-items-add>Add another</button>
            <button type="submit" class="btn-primary !px-3 !py-1.5 text-xs">Save items</button>
            <button type="button" class="text-xs text-sage-dark/70 hover:text-charcoal" data-work-items-cancel>Cancel</button>
          </div>
          <p class="mt-2 hidden text-xs text-red-700" data-work-items-error></p>
          ${
            unallocatedMinutes > 0
              ? `<p class="mt-2 text-xs text-sage-dark/60" data-work-items-remaining">${escapeHtml(String(entry.unallocatedLabel ?? ''))} unallocated</p>`
              : ''
          }
        </form>
      `
          : ''
      }
    </div>
  `;
}

function updateRemoveButtons(container: HTMLElement): void {
  const rows = [...container.querySelectorAll('[data-work-items-row]')];
  rows.forEach((row, index) => {
    const remove = row.querySelector('[data-work-items-remove]');
    if (remove instanceof HTMLButtonElement) {
      remove.classList.toggle('hidden', rows.length <= 1);
    }
    if (index === 0 && rows.length === 1) {
      const button = row.querySelector('[data-work-items-remove]');
      if (button instanceof HTMLButtonElement) button.classList.add('hidden');
    }
  });
}

function bindWorkItemsSection(section: HTMLElement, categories: WorkCategory[], root: HTMLElement): void {
  const toggle = section.querySelector('[data-work-items-toggle]');
  const form = section.querySelector('[data-work-items-form]');
  const rows = section.querySelector('[data-work-items-rows]');
  const error = section.querySelector('[data-work-items-error]');

  if (!(form instanceof HTMLFormElement) || !(rows instanceof HTMLElement)) return;

  toggle?.addEventListener('click', () => {
    form.classList.remove('hidden');
    toggle.classList.add('hidden');
    if (error instanceof HTMLElement) {
      error.textContent = '';
      error.classList.add('hidden');
    }
  });

  form.querySelector('[data-work-items-cancel]')?.addEventListener('click', () => {
    form.classList.add('hidden');
    toggle?.classList.remove('hidden');
    if (error instanceof HTMLElement) {
      error.textContent = '';
      error.classList.add('hidden');
    }
  });

  form.querySelector('[data-work-items-add]')?.addEventListener('click', () => {
    rows.insertAdjacentHTML('beforeend', workItemRow(categories, undefined, true));
    updateRemoveButtons(rows);
  });

  rows.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('[data-work-items-remove]')) return;
    const row = target.closest('[data-work-items-row]');
    row?.remove();
    updateRemoveButtons(rows);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitButton) submitButton.disabled = true;
    if (error instanceof HTMLElement) {
      error.textContent = '';
      error.classList.add('hidden');
    }

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { accept: 'application/json' },
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        summary?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.summary) {
        throw new Error(payload.error ?? 'Unable to save work items.');
      }

      const applySummary = (root as HTMLElement & { __applySummary?: (summary: Record<string, unknown>) => void })
        .__applySummary;
      if (applySummary) applySummary(payload.summary);

      const flash = root.querySelector('[data-timesheet-flash]') as HTMLElement | null;
      if (flash) {
        flash.textContent = 'Work items saved.';
        flash.className =
          'mt-6 max-w-2xl rounded-xl border border-sage-dark/15 bg-white px-4 py-3 text-sm text-sage-dark/80';
        flash.hidden = false;
      }
    } catch (submitError) {
      if (error instanceof HTMLElement) {
        error.textContent =
          submitError instanceof Error ? submitError.message : 'Unable to save work items.';
        error.classList.remove('hidden');
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

export function initTimesheetWorkItems(
  root: HTMLElement,
  categories: WorkCategory[],
  applySummary?: (summary: Record<string, unknown>) => void,
): void {
  if (applySummary) {
    (root as HTMLElement & { __applySummary?: (summary: Record<string, unknown>) => void }).__applySummary =
      applySummary;
  }

  root.querySelectorAll('[data-shift-work-items]').forEach((section) => {
    if (section instanceof HTMLElement) bindWorkItemsSection(section, categories, root);
  });
}
