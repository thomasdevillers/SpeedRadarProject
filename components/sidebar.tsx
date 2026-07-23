"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  Camera,
  FileChartColumn,
  Gauge,
  ListChecks,
  RadioTower,
  Rocket,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Logo } from "@/components/logo";
import type { UserRole } from "@/lib/types";

const mainNav = [
  { href: "/dashboard", label: "Overview", icon: Gauge },
  { href: "/devices", label: "Radars", icon: RadioTower },
  { href: "/events", label: "Events", icon: Camera },
  { href: "/reports", label: "Reports", icon: FileChartColumn },
  { href: "/team", label: "Team & alerts", icon: Users },
];

const adminNav = [
  { href: "/admin/onboarding", label: "Onboard radar", icon: ListChecks },
  { href: "/admin/clients", label: "Clients", icon: Building2 },
  { href: "/admin/fleet", label: "Fleet control", icon: Settings2 },
  { href: "/admin/deployments", label: "Deployments", icon: Rocket },
];

function NavGroup({ items, pathname }: { items: typeof mainNav; pathname: string }) {
  return (
    <nav className="side-nav">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-head"><Logo /></div>
      <div className="sidebar-section-label">Operations</div>
      <NavGroup items={mainNav} pathname={pathname} />
      {role === "roadsafe_admin" && (
        <>
          <div className="sidebar-section-label">RoadSafe admin</div>
          <NavGroup items={adminNav} pathname={pathname} />
        </>
      )}
      <div className="sidebar-foot">
        <div className="secure-lockup"><ShieldCheck size={18} /><span>Private fleet network</span></div>
        <div className="system-line"><Activity size={14} /><span>Platform operational</span></div>
      </div>
    </aside>
  );
}
