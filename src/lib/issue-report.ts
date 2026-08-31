export function buildIssueReportEmail(input: {
  employeeName: string;
  employeeEmail: string;
  page: string;
  description: string;
}): { subject: string; text: string; html: string; replyTo: string } {
  const subject = `Portal issue report from ${input.employeeName}`;
  const text = [
    `${input.employeeName} (${input.employeeEmail}) reported an issue:`,
    '',
    `Page: ${input.page}`,
    '',
    input.description,
    '',
    'Submitted via the Woven Sage employee portal.',
  ].join('\n');

  const html = `
    <p><strong>${escapeHtml(input.employeeName)}</strong> (${escapeHtml(input.employeeEmail)}) reported an issue:</p>
    <p><strong>Page:</strong> ${escapeHtml(input.page)}</p>
    <p><strong>Description:</strong></p>
    <p style="white-space:pre-wrap;">${escapeHtml(input.description)}</p>
    <p style="color:#6b6c72;font-size:13px;">Submitted via the Woven Sage employee portal.</p>
  `.trim();

  return {
    subject,
    text,
    html,
    replyTo: input.employeeEmail,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
