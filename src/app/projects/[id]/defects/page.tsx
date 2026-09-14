import { db } from "@/db";
import { defects, testSuites } from "@/db/schema";
import { eq } from "drizzle-orm";
import DefectsList from "@/components/DefectsList";

export default async function DefectsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const all = await db.query.defects.findMany({
    where: eq(defects.projectId, id),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    with: {
      // Exclude the base64 `data` column — a project with several defect
      // images would otherwise blow past Vercel's response-size limit.
      // The actual bytes are served on demand via /api/attachments/[id].
      attachments: { columns: { id: true, filename: true, retestId: true } },
      testCases: { with: { case: { columns: { id: true, title: true } } } },
    },
  });
  const initialDefects = all.map((d) => ({
    ...d,
    attachments: d.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      url: `/api/attachments/${a.id}`,
      retestId: a.retestId,
    })),
    cases: d.testCases.map((tc) => tc.case),
  }));

  const suites = await db.query.testSuites.findMany({
    where: eq(testSuites.projectId, id),
    columns: { id: true },
  });
  const cases = suites.length
    ? await db.query.testCases.findMany({
        where: (tc, { inArray }) =>
          inArray(
            tc.suiteId,
            suites.map((s) => s.id)
          ),
        columns: { id: true, title: true },
      })
    : [];

  return <DefectsList projectId={id} initialDefects={initialDefects} cases={cases} />;
}
