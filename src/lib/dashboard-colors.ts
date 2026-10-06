import type { Status } from "@/components/DashboardCharts";

// Shared by the dashboard (client) and the PDF report (server) so both draw
// the same colors.
export const STATUS_COLORS: Record<Status, string> = {
  passed: "#22a55b",
  failed: "#e5484d",
  blocked: "#f59e0b",
  skipped: "#14a3b8",
  untested: "#cbd5e1",
};

export const BLUE = "#2a8bd6";
export const ORANGE = "#f39a4c";
export const PURPLE = "#c86fa8";
