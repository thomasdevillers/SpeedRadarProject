import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { getViewerContext } from "@/lib/portal-data";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewerContext();
  return (
    <div className="app-shell">
      <Sidebar role={viewer.role} />
      <div className="app-column">
        <Topbar viewer={viewer} />
        <main id="main-content" className="main-content">{children}</main>
      </div>
    </div>
  );
}

