import { notFound, redirect } from "next/navigation";
import { FollowingDirectory } from "@/components/FollowingDirectory";
import {
  followingDirectoryData,
  type FollowingDirectoryKind,
} from "@/lib/following-directory";

export const dynamic = "force-dynamic";

const kinds = new Set<FollowingDirectoryKind>(["people", "studios", "groups"]);

export default async function FollowingDirectoryPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!kinds.has(kind as FollowingDirectoryKind)) notFound();
  const data = await followingDirectoryData(kind as FollowingDirectoryKind);
  if (!data) redirect("/");
  return <FollowingDirectory data={data} />;
}
