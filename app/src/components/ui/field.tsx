import { cn } from "@/lib/utils";
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactNode } from "react";

const CONTROL =
  "w-full rounded-[var(--radius-inner)] border border-control-border bg-surface px-3.5 py-2.5 text-sm text-ink " +
  "placeholder:text-ink-faint transition-colors " +
  "focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
  "disabled:bg-sunken disabled:text-ink-faint";

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const descriptionId = htmlFor && (error || hint) ? `${htmlFor}-description` : undefined;
  function associateControl(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (child) => {
      if (!isValidElement<{ id?: string; children?: ReactNode; "aria-describedby"?: string; "aria-invalid"?: ComponentProps<"input">["aria-invalid"] }>(child)) return child;
      if (htmlFor && child.props.id === htmlFor) {
        return cloneElement(child, {
          "aria-describedby": [child.props["aria-describedby"], descriptionId].filter(Boolean).join(" ") || undefined,
          "aria-invalid": error ? true : child.props["aria-invalid"],
        });
      }
      return child.props.children ? cloneElement(child, { children: associateControl(child.props.children) }) : child;
    });
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-ink"
      >
        {label}
        {required ? <span aria-hidden="true" className="ml-0.5 text-danger">*</span> : null}
      </label>
      {associateControl(children)}
      {error ? (
        <p id={descriptionId} className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p id={descriptionId} className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(CONTROL, "min-h-[88px] resize-y leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <select className={cn(CONTROL, "cursor-pointer pr-8", className)} {...props}>
      {children}
    </select>
  );
}

/**
 * Dummy-data reminder shown on every data-bearing field.
 *
 * Hackathon use cases are collected before any risk review, so the methodology
 * requires anonymized / synthetic / test data only. Keeping the reminder next to
 * the input — not just in a page banner — is the point.
 */
export function DummyDataHint() {
  return (
    <span className="text-xs text-warn">
      Anonymized, synthetic or test data only — no customer PII.
    </span>
  );
}
