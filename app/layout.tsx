import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RoadSafe Radar Control", template: "%s · RoadSafe Radar" },
  description: "Secure fleet monitoring and traffic evidence for RoadSafe speed radars.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="grain" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
