import { NextRequest } from "next/server";
import { requireUser } from "@/lib/require-auth";
import { receiveRunCaseChunk } from "@/lib/chunk-upload";

const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB

// Evidence uploaded by hand from a run (see RunExecution), in chunks.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  return receiveRunCaseChunk(await req.formData(), id, MAX_TOTAL_BYTES);
}
