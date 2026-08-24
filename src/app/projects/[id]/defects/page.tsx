import { db } from "@/db";
import { defects, testSuites } from "@/db/schema";
import { eq } from "drizzle-orm";
import DefectsList from "@/components/DefectsList";

export default async function DefectsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const all = await db.query.defects.findMany({
    where: eq(defects.projectId, id),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    with: { attachments: true, case: { columns: { id: true, title: true } } },
  });
  const initialDefects = all.map((d) => ({
    ...d,
    attachments: d.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      url: `data:${a.mimeType};base64,${a.data}`,
    })),
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
