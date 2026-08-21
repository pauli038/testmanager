import { db } from "@/db";
import { defects } from "@/db/schema";
import { eq } from "drizzle-orm";
import DefectsList from "@/components/DefectsList";

export default async function DefectsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const all = await db.query.defects.findMany({
    where: eq(defects.projectId, id),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    with: { attachments: true },
  });
  const initialDefects = all.map((d) => ({
    ...d,
    attachments: d.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      url: `data:${a.mimeType};base64,${a.data}`,
    })),
  }));
  return <DefectsList projectId={id} initialDefects={initialDefects} />;
}
