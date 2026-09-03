type WorkCategory = { key: string; label: string; color: string };
type WorkItem = { category: string; label: string; color: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function categoryCheckboxes(categories: WorkCategory[], selected: Set<string>): string {
  return categories
    .map(
      (category) => `
        <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-sage-dark/10 bg-white px-3 py-2 text-sm text-charcoal">
          <input
            type="checkbox"
            name="category"
            value="${escapeHtml(category.key)}"
            ${selected.has(category.key) ? 'checked' : ''}
            class="size-4 rounded border-sage-dark/25 text-sage-dark focus:ring-sage-dark/30"
          />
          <span class="size-2 shrink-0 rounded-full" style="background-color: ${category.color}"></span>
          <span>${escapeHtml(category.label)}</span>
        </label>
      `,
    )
    .join('');
}

export function renderWorkItemsSection(
  entry: Record<string, unknown>,
  categories: WorkCategory[],
): string {
  const canEdit = Boolean(entry.canEditWorkItems);
  const workItems = (entry.workItems as WorkItem[] | undefined) ?? [];
  const shiftId = String(entry.id ?? '');
  const selected = new Set(workItems.map((item) => item.category));

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
              ${escapeHtml(item.label)}
            </span>
          `,
          )
          .join('')
      : `<p class="text-xs text-sage-dark/60" data-work-items-empty>${canEdit ? 'No work items logged for this shift.' : '—'}</p>`;

  return `
    <div
      class="mt-3 border-t border-sage-dark/10 pt-3"
      data-shift-work-items
      data-shift-id="${escapeHtml(shiftId)}"
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
          <p class="text-xs text-sage-dark/70">Check what you worked on during this shift. This is used for activity frequency, not hour allocation.</p>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">${categoryCheckboxes(categories, selected)}</div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button type="submit" class="btn-primary !px-3 !py-1.5 text-xs">Save items</button>
            <button type="button" class="text-xs text-sage-dark/70 hover:text-charcoal" data-work-items-cancel>Cancel</button>
          </div>
          <p class="mt-2 hidden text-xs text-red-700" data-work-items-error></p>
        </form>
      `
          : ''
      }
    </div>
  `;
}

function bindWorkItemsSection(section: HTMLElement, _categories: WorkCategory[], root: HTMLElement): void {
  const toggle = section.querySelector('[data-work-items-toggle]');
  const form = section.querySelector('[data-work-items-form]');
  const error = section.querySelector('[data-work-items-error]');

  if (!(form instanceof HTMLFormElement)) return;

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
