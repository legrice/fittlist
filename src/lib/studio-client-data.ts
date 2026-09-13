import type { gymMonth, studioManagersForSettings, studioPageViews } from "@/app/actions/gym";

async function readStudioData<T>(studioId: string, view: string, month?: string): Promise<T> {
  const query = new URLSearchParams({ view });
  if (month) query.set("month", month);
  const response = await fetch(`/api/studios/${encodeURIComponent(studioId)}/manage-data?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Studio data unavailable");
  return response.json();
}

export const fetchStudioMonth = (studioId: string, month?: string) =>
  readStudioData<Awaited<ReturnType<typeof gymMonth>>>(studioId, "month", month);
export const fetchStudioManagers = (studioId: string) =>
  readStudioData<Awaited<ReturnType<typeof studioManagersForSettings>>>(studioId, "managers");
export const fetchStudioPageViews = (studioId: string) =>
  readStudioData<Awaited<ReturnType<typeof studioPageViews>>>(studioId, "views");
