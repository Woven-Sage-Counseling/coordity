export function transactionShortName(name: string): string {
  const trimmed = name.trim();
  const purchaseMatch = trimmed.match(/^(.+?)\s+-\s+Purchase from\b/i);
  if (purchaseMatch?.[1]) return purchaseMatch[1].trim();

  if (trimmed.length > 72) {
    const beforePipe = trimmed.split('|')[0]?.trim();
    if (beforePipe && beforePipe.length < trimmed.length) return beforePipe;
  }

  return trimmed;
}

export function transactionDetailsText(name: string, memo: string | null): string | null {
  const trimmedName = name.trim();
  const trimmedMemo = memo?.trim() ?? '';
  const shortName = transactionShortName(trimmedName);
  const parts: string[] = [];

  if (trimmedName && trimmedName !== shortName) {
    parts.push(trimmedName);
  }

  if (trimmedMemo && !parts.includes(trimmedMemo) && trimmedMemo !== shortName) {
    parts.push(trimmedMemo);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

export function hasExpandableTransactionDetails(name: string, memo: string | null): boolean {
  return transactionDetailsText(name, memo) != null;
}
