import { avatarColor, cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-base",
  };

  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        sizes[size],
        avatarColor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatar row, as used for the team strip on the dashboard. */
export function AvatarStack({
  names,
  max = 5,
  size = "sm",
}: {
  names: string[];
  max?: number;
  size?: "xs" | "sm" | "md";
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <Avatar
          key={`${n}-${i}`}
          name={n}
          size={size}
          className="-ml-2 ring-2 ring-surface first:ml-0"
        />
      ))}
      {rest > 0 ? (
        <span className="-ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-sunken text-xs font-medium text-ink-soft ring-2 ring-surface">
          +{rest}
        </span>
      ) : null}
    </div>
  );
}
