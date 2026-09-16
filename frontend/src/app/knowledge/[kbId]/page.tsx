import { redirect } from "next/navigation";

export default async function LegacyKnowledgeDetailPage({
  params,
}: {
  params: Promise<{ kbId: string }>;
}) {
  const { kbId } = await params;
  redirect(`/admin/knowledge/${kbId}`);
}
