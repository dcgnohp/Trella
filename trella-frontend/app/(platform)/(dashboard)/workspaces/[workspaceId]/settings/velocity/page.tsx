"use client";
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { VelocityConfigService } from "@/lib/client";
import { useParams } from "next/navigation";

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

export default function VelocitySettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const [hoursInput, setHoursInput] = React.useState<string>("4");

  const { data: config, isLoading } = useQuery({
    queryKey: ["velocity-config", workspaceId],
    queryFn: () => VelocityConfigService.VelocityConfig_velocityConfigGetVelocityConfig({ workspaceId }),
  });

  React.useEffect(() => {
    if (config) setHoursInput(String(config.hoursPerPoint));
  }, [config]);

  const mutation = useMutation({
    mutationFn: () =>
      VelocityConfigService.VelocityConfig_velocityConfigUpdateVelocityConfig({
        workspaceId,
        requestBody: { hoursPerPoint: parseFloat(hoursInput) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["velocity-config", workspaceId] });
      toast.success("Velocity config saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  const h = parseFloat(hoursInput) || 4;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--trella-text)", margin: "0 0 8px" }}>
        Velocity Configuration
      </h1>
      <p style={{ fontSize: 14, color: "var(--trella-text-subtle)", margin: "0 0 32px" }}>
        Configure how story points translate to time estimates. Used for auto-calculating due dates.
      </p>

      <div style={{ background: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 8, padding: "24px", marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--trella-text)", marginBottom: 6 }}>
          Hours per story point
        </label>
        <p style={{ fontSize: 12, color: "var(--trella-text-subtle)", margin: "0 0 12px" }}>
          How many hours of work does 1 story point represent?
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="number"
            min={0.5}
            max={40}
            step={0.5}
            value={hoursInput}
            onChange={e => setHoursInput(e.target.value)}
            style={{ width: 100, padding: "6px 10px", fontSize: 14, border: "1px solid var(--trella-border)", borderRadius: 4, outline: "none", color: "var(--trella-text)" }}
          />
          <span style={{ fontSize: 13, color: "var(--trella-text-subtle)" }}>hours / point</span>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || isLoading}
            style={{ padding: "6px 20px", background: "#0052CC", color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Save
          </button>
        </div>
      </div>

      <div style={{ background: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--trella-border)", background: "var(--trella-surface-sunken)" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--trella-text)" }}>Story point reference</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--trella-surface-sunken)" }}>
              {["Points", "Hours", "Days"].map(col => (
                <th key={col} style={{ padding: "8px 20px", fontSize: 11, fontWeight: 700, color: "var(--trella-text-subtle)", textTransform: "uppercase", textAlign: "left", borderBottom: "1px solid var(--trella-border)" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIBONACCI.map(pts => {
              const hours = pts * h;
              const days = hours / 8;
              return (
                <tr key={pts} style={{ borderBottom: "1px solid #F4F5F7" }}>
                  <td style={{ padding: "10px 20px", fontSize: 13, color: "var(--trella-text)", fontWeight: 600 }}>{pts}</td>
                  <td style={{ padding: "10px 20px", fontSize: 13, color: "var(--trella-text)" }}>{hours.toFixed(1)}h</td>
                  <td style={{ padding: "10px 20px", fontSize: 13, color: "var(--trella-text-subtle)" }}>≈ {days.toFixed(1)} days</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
