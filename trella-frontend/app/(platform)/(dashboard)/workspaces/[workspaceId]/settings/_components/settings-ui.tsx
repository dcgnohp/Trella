"use client";

/**
 * Shared presentational primitives for the workspace settings pages.
 * Kept intentionally small: every settings screen reuses the same
 * container / card / field / toggle so the pages stay tiny and consistent.
 */

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function SettingsContainer({
  breadcrumb,
  title,
  description,
  actions,
  children,
}: {
  breadcrumb: { label: string; href?: string }[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 32px 64px", fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--trella-text-subtle)", marginBottom: 10 }}>
        {breadcrumb.map((b, i) => (
          <React.Fragment key={b.label}>
            {i > 0 && <ChevronRight size={12} style={{ color: "var(--trella-text-subtlest)" }} />}
            {b.href ? (
              <Link href={b.href} style={{ color: "var(--trella-text-subtle)", textDecoration: "none" }}>{b.label}</Link>
            ) : (
              <span style={{ color: i === breadcrumb.length - 1 ? "var(--trella-brand)" : "var(--trella-text-subtle)", fontWeight: i === breadcrumb.length - 1 ? 700 : 600 }}>{b.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--trella-text)", letterSpacing: "-0.02em" }}>{title}</h1>
          {description && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--trella-text-subtle)" }}>{description}</p>}
        </div>
        {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
      </div>

      {children}
    </div>
  );
}

export function SettingsCard({
  title,
  description,
  children,
  style,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        background: "var(--trella-surface)",
        border: "1px solid var(--trella-border)",
        borderRadius: 10,
        boxShadow: "var(--trella-shadow-card)",
        marginBottom: 20,
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || description) && (
        <header style={{ padding: "16px 20px", borderBottom: "1px solid var(--trella-border-subtle)" }}>
          {title && <div style={{ fontSize: 15, fontWeight: 700, color: "var(--trella-text)" }}>{title}</div>}
          {description && <div style={{ fontSize: 12.5, color: "var(--trella-text-subtle)", marginTop: 3 }}>{description}</div>}
        </header>
      )}
      <div style={{ padding: "8px 20px" }}>{children}</div>
    </section>
  );
}

export function FieldRow({
  label,
  hint,
  control,
  last,
}: {
  label: string;
  hint?: string;
  control: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "16px 0",
        borderBottom: last ? "none" : "1px solid var(--trella-border-subtle)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--trella-text)" }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "var(--trella-text-subtle)", marginTop: 2, lineHeight: 1.45 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  width = 220,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  width?: number;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width,
        padding: "7px 12px",
        fontSize: 13,
        fontWeight: 500,
        color: "var(--trella-text)",
        background: "var(--trella-surface)",
        border: "1px solid var(--trella-border-strong)",
        borderRadius: 6,
        outline: "none",
        cursor: "pointer",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        padding: 2,
        background: checked ? "var(--trella-brand)" : "var(--trella-border-strong)",
        transition: "background 0.15s",
        display: "flex",
        justifyContent: checked ? "flex-end" : "flex-start",
        alignItems: "center",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          transition: "all 0.15s",
        }}
      />
    </button>
  );
}
