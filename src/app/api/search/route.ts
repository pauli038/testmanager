import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { defects, projects, testCases, testRuns, testSuites } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { desc, eq, ilike, or, sql, type AnyColumn } from "drizzle-orm";

const LIMIT = 6;

// Global search (Ctrl+K): cases by code or title, defects, runs and projects,
// across every project. ?q=texto[&projectId=…] — with projectId, that
// project's results come first.
export async function GET(req: NextRequest) {
  const { error } = await requireUser();
  if (error) return error;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (q.length < 2) return NextResponse.json({ cases: [], defects: [], runs: [], projects: [] });

  // Escape LIKE wildcards so "100%" or "TC_01" search literally.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // Current project first, then exact code hits, then the rest.
  const here = (col: AnyColumn) =>
    projectId ? sql`case when ${col} = ${projectId} then 0 else 1 end` : sql`0`;

  const [cases, defectRows, runs, projectRows] = await Promise.all([
    db
      .select({
        id: testCases.id,
        code: testCases.code,
        title: testCases.title,
        projectId: testSuites.projectId,
        projectName: projects.name,
      })
      .from(testCases)
      .innerJoin(testSuites, eq(testCases.suiteId, testSuites.id))
      .innerJoin(projects, eq(testSuites.projectId, projects.id))
      .where(or(ilike(testCases.code, pattern), ilike(testCases.title, pattern)))
      .orderBy(
        here(testSuites.projectId),
        sql`case when upper(${testCases.code}) = upper(${q}) then 0 else 1 end`,
        sql`${testCases.code} asc nulls last`
      )
      .limit(LIMIT),
    db
      .select({
        id: defects.id,
        title: defects.title,
        severity: defects.severity,
        status: defects.status,
        projectId: defects.projectId,
        projectName: projects.name,
      })
      .from(defects)
      .innerJoin(projects, eq(defects.projectId, projects.id))
      .where(ilike(defects.title, pattern))
      .orderBy(here(defects.projectId), desc(defects.createdAt))
      .limit(LIMIT),
    db
      .select({
        id: testRuns.id,
        name: testRuns.name,
        source: testRuns.source,
        createdAt: testRuns.createdAt,
        projectId: testRuns.projectId,
        projectName: projects.name,
      })
      .from(testRuns)
      .innerJoin(projects, eq(testRuns.projectId, projects.id))
      .where(ilike(testRuns.name, pattern))
      .orderBy(here(testRuns.projectId), desc(testRuns.createdAt))
      .limit(LIMIT),
    db
      .select({ id: projects.id, name: projects.name, description: projects.description })
      .from(projects)
      .where(or(ilike(projects.name, pattern), ilike(projects.description, pattern)))
      .limit(LIMIT),
  ]);

  return NextResponse.json({ cases, defects: defectRows, runs, projects: projectRows });
}
