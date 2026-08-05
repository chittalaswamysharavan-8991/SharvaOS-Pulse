import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SharvaOS Today",
  description: "The single SharvaOS front door for canonical priorities, projects, systems, and Daily Pulse.",
};

export default function TodayLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
