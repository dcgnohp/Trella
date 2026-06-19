"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free Tabs primitive (shadcn-compatible API surface).
 *
 * The project does not ship `@radix-ui/react-tabs`, so this provides the same
 * `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` composition shadcn exposes
 * — controlled or uncontrolled — using React context + local state. Triggers are
 * keyboard-navigable and expose the standard `role="tab"` / `role="tabpanel"`
 * ARIA wiring so it behaves like the real thing.
 */

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be used within <Tabs>`);
  }
  return ctx;
}

export interface TabsProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  /** Controlled active tab value. */
  value?: string;
  /** Initial active tab value for uncontrolled usage. */
  defaultValue?: string;
  /** Fires whenever the active tab changes (controlled or uncontrolled). */
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  (
    { value, defaultValue, onValueChange, className, children, ...props },
    ref,
  ) => {
    const baseId = React.useId();
    const isControlled = value !== undefined;
    const [internal, setInternal] = React.useState(defaultValue ?? "");
    const current = isControlled ? value : internal;

    const setValue = React.useCallback(
      (next: string) => {
        if (!isControlled) setInternal(next);
        onValueChange?.(next);
      },
      [isControlled, onValueChange],
    );

    const ctx = React.useMemo<TabsContextValue>(
      () => ({ value: current, setValue, baseId }),
      [current, setValue, baseId],
    );

    return (
      <TabsContext.Provider value={ctx}>
        <div ref={ref} className={className} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);
Tabs.displayName = "Tabs";

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, ...props }, ref) => {
    const ctx = useTabsContext("TabsTrigger");
    const active = ctx.value === value;
    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={active}
        aria-controls={`${ctx.baseId}-panel-${value}`}
        id={`${ctx.baseId}-tab-${value}`}
        data-state={active ? "active" : "inactive"}
        onClick={() => ctx.setValue(value)}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          active
            ? "bg-background text-foreground shadow-sm"
            : "hover:text-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);
TabsTrigger.displayName = "TabsTrigger";

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, children, ...props }, ref) => {
    const ctx = useTabsContext("TabsContent");
    const active = ctx.value === value;
    if (!active) return null;
    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`${ctx.baseId}-panel-${value}`}
        aria-labelledby={`${ctx.baseId}-tab-${value}`}
        tabIndex={0}
        className={cn(
          "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
