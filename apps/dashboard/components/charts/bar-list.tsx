import Link from "next/link";
import { formatNumber } from "@/lib/format";

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  secondary?: string;
  href?: string;
}

/** Ranked horizontal bars with visible values: one series, one color. */
export function BarList({ items, emptyLabel = "No data yet" }: { items: BarListItem[]; emptyLabel?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-mono text-[13px]">{item.label}</span>
              <span className="tabular shrink-0 text-muted-foreground">
                {item.secondary && <span className="mr-3 text-xs">{item.secondary}</span>}
                <span className="font-medium text-foreground">{formatNumber(item.value)}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div className="h-1.5 rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: "var(--series-1)" }} />
            </div>
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="block rounded-md px-2 py-1.5 hover:bg-accent/60">
                {content}
              </Link>
            ) : (
              <div className="px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
