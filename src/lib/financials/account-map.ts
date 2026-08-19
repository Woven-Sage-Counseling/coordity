/** Chart of accounts from Woven Sage Counseling LLC, exported 2026-08-19. */

export type ExpenseBucket = 'therapist' | 'management' | 'software';
export type BankBucket = 'relay_operating' | 'boa_reserve';

function normalize(name: string): string {
  return name
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const EXPENSE_ACCOUNTS: Record<string, ExpenseBucket> = {
  'therapist compensation': 'therapist',
  'management compensation': 'management',
  'software and technology': 'software',
  'website and technology': 'software',
  'ai and automation': 'software',
};

export function classifyExpense(name: string): ExpenseBucket | null {
  const key = normalize(name).replace(/^total /, '');
  if (EXPENSE_ACCOUNTS[key]) return EXPENSE_ACCOUNTS[key];
  for (const [account, bucket] of Object.entries(EXPENSE_ACCOUNTS)) {
    if (key.endsWith(` ${account}`)) return bucket;
  }
  return null;
}

export function classifyBank(name: string, accountNumber?: string | null): BankBucket | null {
  const haystack = `${normalize(name)} ${normalize(accountNumber ?? '')}`;
  if (/\b9272\b/.test(haystack) || haystack.includes('operating checking') || haystack.includes('business savings') || /\b9273\b/.test(haystack)) {
    return 'relay_operating';
  }
  if (/\b1809\b/.test(haystack) || haystack.includes('business adv') || haystack.includes('fundamentals')) {
    return 'boa_reserve';
  }
  return null;
}
