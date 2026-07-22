import { notFound } from "next/navigation";
import { getViewerContext } from "@/lib/portal-data";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewerContext();
  if (viewer.role !== "roadsafe_admin") notFound();
  return children;
}
