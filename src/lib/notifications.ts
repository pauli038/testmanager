import { db } from "@/db";
import {
  defects,
  defectTestCases,
  notificationSubscriptions,
  projects,
  testCases,
  testRunCases,
  testRuns,
  users,
} from "@/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { stripAnsi } from "@/lib/ansi";
import { appUrl, emailLayout, escapeHtml, isEmailEnabled, sendEmails } from "@/lib/email";

// Email notifications. Both entry points are meant to run after the response
// (next/server `after`), and never throw: a mail problem must not break
// saving results or defects.

const MAX_LISTED = 20;
const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const SEVERITY_LABEL: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

type Recipient = { email: string; name: string };

async function subscribers(
  projectId: string,
  filter: (s: { runFailed: boolean; defectMinSeverity: string | null }) => boolean,
  excludeUserId?: string | null
): Promise<Recipient[]> {
  const rows = await db
    .select({
      email: users.email,
      name: users.name,
      userId: users.id,
      runFailed: notificationSubscriptions.runFailed,
      defectMinSeverity: notificationSubscriptions.defectMinSeverity,
    })
    .from(notificationSubscriptions)
    .innerJoin(users, eq(notificationSubscriptions.userId, users.id))
    .where(eq(notificationSubscriptions.projectId, projectId));
  return rows.filter((r) => r.userId !== excludeUserId && filter(r));
}

function footer(projectId: string, projectName: string, reason: string) {
  const settings = `${appUrl()}/projects/${projectId}/settings`;
  return `Recibes este correo porque activaste “${escapeHtml(reason)}” en ${escapeHtml(projectName)}. Puedes cambiarlo en <a href="${escapeHtml(settings)}" style="color:#0f766e">Ajustes → Notificaciones</a>.`;
}

async function safe(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[notificaciones] ${label}:`, err);
  }
}

// ---------- Run finished with failures ----------

export function notifyRunFinished(runId: string, excludeUserId?: string | null) {
  return safe("run terminado", async () => {
    if (!isEmailEnabled()) return;
    const run = await db.query.testRuns.findFirst({ where: eq(testRuns.id, runId) });
    if (!run) return;

    const results = await db
      .select({
        caseId: testRunCases.caseId,
        status: testRunCases.status,
        errorMessage: testRunCases.errorMessage,
        code: testCases.code,
        title: testCases.title,
      })
      .from(testRunCases)
      .innerJoin(testCases, eq(testRunCases.caseId, testCases.id))
      .where(eq(testRunCases.runId, runId));
    const failed = results.filter((r) => r.status === "failed" || r.status === "blocked");
    if (failed.length === 0) return;

    const recipients = await subscribers(run.projectId, (s) => s.runFailed, excludeUserId);
    if (recipients.length === 0) return;
    const project = await db.query.projects.findFirst({ where: eq(projects.id, run.projectId) });
    const projectName = project?.name.trim() ?? "Proyecto";

    // "Nuevo" = its previous execution (in another run) passed: it just broke.
    const previous = await db
      .selectDistinctOn([testRunCases.caseId], {
        caseId: testRunCases.caseId,
        status: testRunCases.status,
      })
      .from(testRunCases)
      .where(
        and(
          inArray(
            testRunCases.caseId,
            failed.map((f) => f.caseId)
          ),
          ne(testRunCases.runId, runId),
          ne(testRunCases.status, "untested"),
          sql`${testRunCases.executedAt} is not null`
        )
      )
      .orderBy(testRunCases.caseId, sql`${testRunCases.executedAt} desc`);
    const wasPassing = new Set(previous.filter((p) => p.status === "passed").map((p) => p.caseId));
    const ordered = [...failed].sort(
      (a, b) => Number(wasPassing.has(b.caseId)) - Number(wasPassing.has(a.caseId))
    );

    const count = (s: string) => results.filter((r) => r.status === s).length;
    const newCount = failed.filter((f) => wasPassing.has(f.caseId)).length;
    const runUrl = `${appUrl()}/projects/${run.projectId}/runs/${run.id}`;

    const summary = [
      ["Aprobados", count("passed"), "#16a34a"],
      ["Fallidos", count("failed"), "#dc2626"],
      ["Bloqueados", count("blocked"), "#d97706"],
      ["Omitidos", count("skipped"), "#0891b2"],
    ]
      .filter(([, n]) => Number(n) > 0)
      .map(
        ([label, n, color]) =>
          `<span style="display:inline-block;margin:0 12px 6px 0;font-size:13px"><b style="color:${color}">${n}</b> ${label}</span>`
      )
      .join("");

    const rows = ordered
      .slice(0, MAX_LISTED)
      .map((f) => {
        const firstLine = f.errorMessage ? stripAnsi(f.errorMessage).split("\n").find((l) => l.trim()) ?? "" : "";
        const tag = wasPassing.has(f.caseId)
          ? ` <span style="font-size:11px;font-weight:600;color:#b45309;background:#fef3c7;border-radius:4px;padding:1px 6px">NUEVO</span>`
          : "";
        return `<tr><td style="padding:8px 0;border-top:1px solid #f1f5f9;font-size:13px">
${f.code ? `<span style="font-family:monospace;font-size:12px;color:#475569">${escapeHtml(f.code)}</span> · ` : ""}${escapeHtml(f.title)}${tag}
${firstLine ? `<div style="margin-top:2px;font-size:12px;color:#b91c1c;font-family:monospace">${escapeHtml(firstLine.slice(0, 200))}</div>` : ""}
</td></tr>`;
      })
      .join("");
    const more =
      failed.length > MAX_LISTED
        ? `<p style="font-size:12px;color:#64748b;margin:8px 0 0">… y ${failed.length - MAX_LISTED} más.</p>`
        : "";
    const ci = [
      run.branch && `Rama <b>${escapeHtml(run.branch)}</b>`,
      run.commitSha && `commit <span style="font-family:monospace">${escapeHtml(run.commitSha.slice(0, 7))}</span>`,
      run.ciUrl && `<a href="${escapeHtml(run.ciUrl)}" style="color:#0f766e">ver build en CI</a>`,
    ]
      .filter(Boolean)
      .join(" · ");

    const title = `${failed.length} caso${failed.length === 1 ? "" : "s"} con fallos en “${run.name}”`;
    const html = emailLayout({
      title,
      body: `<p style="margin:0 0 12px;font-size:14px;color:#475569">${escapeHtml(projectName)}${
        newCount
          ? ` · <b style="color:#b45309">${newCount} ${newCount === 1 ? "empezó" : "empezaron"} a fallar en este run</b>`
          : ""
      }</p>
<div style="margin-bottom:8px">${summary}</div>
${ci ? `<p style="margin:0 0 12px;font-size:12px;color:#64748b">${ci}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${more}`,
      action: { label: "Abrir el run", url: runUrl },
      footer: footer(run.projectId, projectName, "Runs con fallos"),
    });

    await sendEmails(
      recipients.map((r) => ({ to: r.email, subject: `[${projectName}] ${title}`, html }))
    );
  });
}

// ---------- New defect ----------

export function notifyDefectCreated(defectId: string, excludeUserId?: string | null) {
  return safe("defecto nuevo", async () => {
    if (!isEmailEnabled()) return;
    const defect = await db.query.defects.findFirst({ where: eq(defects.id, defectId) });
    if (!defect) return;
    const rank = SEVERITY_RANK[defect.severity] ?? 0;
    if (rank < SEVERITY_RANK.high) return;

    const recipients = await subscribers(
      defect.projectId,
      (s) => !!s.defectMinSeverity && rank >= SEVERITY_RANK[s.defectMinSeverity],
      excludeUserId
    );
    if (recipients.length === 0) return;

    const [project, creator, linked] = await Promise.all([
      db.query.projects.findFirst({ where: eq(projects.id, defect.projectId) }),
      defect.createdBy ? db.query.users.findFirst({ where: eq(users.id, defect.createdBy) }) : null,
      db
        .select({ code: testCases.code, title: testCases.title })
        .from(defectTestCases)
        .innerJoin(testCases, eq(defectTestCases.caseId, testCases.id))
        .where(eq(defectTestCases.defectId, defect.id)),
    ]);
    const projectName = project?.name.trim() ?? "Proyecto";
    const severity = SEVERITY_LABEL[defect.severity] ?? defect.severity;
    const color = defect.severity === "critical" ? "#b91c1c" : "#c2410c";

    const details = [
      ["Severidad", `<b style="color:${color}">${escapeHtml(severity)}</b>`],
      creator && ["Reportado por", escapeHtml(creator.name)],
      defect.module && ["Módulo", escapeHtml(defect.module)],
      defect.environment && ["Ambiente", escapeHtml(defect.environment)],
      linked.length > 0 && [
        "Casos",
        linked.map((c) => escapeHtml(c.code ? `${c.code} · ${c.title}` : c.title)).join("<br>"),
      ],
    ]
      .filter((d): d is [string, string] => Array.isArray(d))
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;font-size:13px;color:#64748b;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0;font-size:13px">${v}</td></tr>`
      )
      .join("");

    const title = `${defect.severity === "critical" ? "Defecto crítico" : "Defecto de severidad alta"}: ${defect.title}`;
    const html = emailLayout({
      title,
      body: `<p style="margin:0 0 12px;font-size:14px;color:#475569">${escapeHtml(projectName)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">${details}</table>
${defect.description ? `<p style="margin:12px 0 0;font-size:13px;white-space:pre-wrap">${escapeHtml(defect.description.slice(0, 1500))}</p>` : ""}`,
      action: { label: "Ver defectos", url: `${appUrl()}/projects/${defect.projectId}/defects` },
      footer: footer(defect.projectId, projectName, "Defectos nuevos"),
    });

    await sendEmails(
      recipients.map((r) => ({ to: r.email, subject: `[${projectName}] ${title}`, html }))
    );
  });
}
