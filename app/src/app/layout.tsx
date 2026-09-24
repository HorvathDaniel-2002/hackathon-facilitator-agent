import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hackathon Facilitator",
  description:
    "Track customer AI use cases with Kanban, Copilot Studio fit evaluation, readiness evidence and handoff.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full">
        <noscript>Enable JavaScript to edit this workspace. Editing stays disabled until the application can safely handle submissions.</noscript>
        {children}
      </body>
    </html>
  );
}
