export const card = "rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(17,17,17,0.04)] dark:border-neutral-800 dark:bg-[#1a1a1a]";
export const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-blue-500/25 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-300";
export const btn = "rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-[#242424] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-300";
export const btnGhost = "rounded-md border border-neutral-200 px-3.5 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800";

export function Chip({ tone, children }: { tone: "green" | "blue" | "violet" | "red" | "amber" | "gray"; children: React.ReactNode }) {
  const t = {
    green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300", red: "bg-red-500/10 text-red-700 dark:text-red-400",
    amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300", gray: "bg-neutral-500/15 text-neutral-600 dark:text-neutral-400",
  }[tone];
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function Bar({ value, max, tone = "bg-neutral-900 dark:bg-white" }: { value: number; max: number; tone?: string }) {
  return (
    <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} />
    </div>
  );
}
