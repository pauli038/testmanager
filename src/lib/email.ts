// Email through Resend (resend.com). Needs RESEND_API_KEY and EMAIL_FROM; without
// them nothing is sent and the app falls back to showing links on screen.

export type EmailMessage = { to: string; subject: string; html: string };

export function isEmailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

// Public URL of the app for links in emails. APP_URL is preferred so links
// never depend on the request's Host header.
export function appUrl(fallbackOrigin?: string) {
  return (process.env.APP_URL || fallbackOrigin || "").replace(/\/$/, "");
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function sendEmail(message: EmailMessage) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, ...message }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
}

// One email per recipient (nobody sees the others' addresses), sent with
// Resend's batch endpoint, 100 at a time.
export async function sendEmails(messages: EmailMessage[]) {
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100).map((m) => ({ from: process.env.EMAIL_FROM, ...m }));
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
  }
}

// Shared look of every notification: brand header, content, footer with the
// reason the person got it.
export function emailLayout({
  title,
  body,
  action,
  footer,
}: {
  title: string;
  body: string; // already-escaped HTML
  action?: { label: string; url: string };
  footer?: string; // already-escaped HTML
}) {
  const button = action
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:16px 24px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f766e;font-size:14px">Test Manager</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:18px;line-height:1.4">${escapeHtml(title)}</h1>
${body}
${button}
</td></tr>
${footer ? `<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${footer}</td></tr>` : ""}
</table>
</td></tr></table>
</body></html>`;
}
