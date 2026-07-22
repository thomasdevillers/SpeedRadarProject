import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { signOut } from "@/app/(portal)/actions";
import type { ViewerContext } from "@/lib/portal-data";

export function Topbar({ viewer }: { viewer: ViewerContext }) {
  const initials = viewer.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">Live operating picture</span>
        <strong>{viewer.organizationName}</strong>
      </div>
      <div className="topbar-actions">
        <Link className="icon-button" href="/team" aria-label="Notification settings"><Bell size={18} /></Link>
        <div className="user-menu">
          <span className="avatar">{initials}</span>
          <span className="user-copy"><strong>{viewer.displayName}</strong><small>{viewer.role.replaceAll("_", " ")}</small></span>
        </div>
        <form action={signOut}><button className="icon-button" type="submit" aria-label="Sign out"><LogOut size={17} /></button></form>
      </div>
    </header>
  );
}
