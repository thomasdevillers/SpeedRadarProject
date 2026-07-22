import type { ReactNode } from "react";

export function PageHeader({ kicker, title, description, actions }: { kicker: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="page-header reveal">
      <div>
        <span className="eyebrow">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

