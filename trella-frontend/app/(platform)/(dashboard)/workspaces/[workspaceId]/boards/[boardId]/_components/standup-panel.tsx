"use client";

import { useEffect, useRef, useState } from "react";
import SettingsIcon from "@atlaskit/icon/core/settings";
import VideoPlayIcon from "@atlaskit/icon/core/video-play";
import VideoPauseIcon from "@atlaskit/icon/core/video-pause";
import AudioIcon from "@atlaskit/icon/core/audio";
import ArrowLeftIcon from "@atlaskit/icon/core/arrow-left";
import ArrowRightIcon from "@atlaskit/icon/core/arrow-right";
import RefreshIcon from "@atlaskit/icon/core/refresh";

import type { ProjectMemberPublic } from "@/lib/client";

interface StandupPanelProps {
  members: ProjectMemberPublic[];
  onClose: () => void;
}

function getInitials(fullName: string | null, email: string): string {
  if (!fullName) {
    return email.slice(0, 2).toUpperCase();
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function StandupPanel({ members, onClose }: StandupPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [isRunning, setIsRunning] = useState(false);
  const [shuffledMembers, setShuffledMembers] = useState<ProjectMemberPublic[]>([...members]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => s - 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, secondsLeft]);

  useEffect(() => {
    setSecondsLeft(120);
    setIsRunning(false);
  }, [currentIndex]);

  const handleShuffle = () => {
    setShuffledMembers(fisherYates(members));
    setCurrentIndex(0);
  };

  const handlePrev = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setCurrentIndex((i) => Math.min(shuffledMembers.length - 1, i + 1));

  const btnBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    minWidth: 28,
    padding: "0 8px",
    border: "1px solid var(--trella-border)",
    borderRadius: 4,
    background: "var(--trella-surface)",
    color: "var(--trella-text)",
    cursor: "pointer",
    fontSize: 12,
    gap: 4,
  };

  return (
    <div
      style={{
        width: 280,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--trella-border)",
        background: "var(--trella-surface)",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--trella-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--trella-text)" }}>Standup</span>
        <button
          style={{ ...btnBase, border: "none", background: "transparent", color: "var(--trella-text-subtle)" }}
          onClick={() => {}}
          aria-label="Settings"
        >
          <SettingsIcon label="Settings" size="small" />
        </button>
      </div>

      {/* Timer section */}
      <div style={{ padding: 16 }}>
        <div
          style={{
            fontSize: 32,
            fontFamily: "monospace",
            color: "var(--trella-text)",
            fontWeight: 700,
            marginBottom: 12,
            letterSpacing: 2,
          }}
        >
          {formatTime(secondsLeft)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            style={{ ...btnBase, background: "#0052CC", border: "none", color: "var(--trella-surface)", borderRadius: "50%", width: 36, height: 36, minWidth: 36 }}
            onClick={() => setIsRunning((r) => !r)}
            aria-label={isRunning ? "Pause" : "Play"}
          >
            {isRunning ? (
              <VideoPauseIcon label="Pause" size="small" />
            ) : (
              <VideoPlayIcon label="Play" size="small" />
            )}
          </button>
          <button
            style={{ ...btnBase, background: "transparent", border: "none", color: "var(--trella-text-subtle)" }}
            aria-label="Volume"
          >
            <AudioIcon label="Volume" size="small" />
          </button>
        </div>
      </div>

      {/* Navigation row */}
      <div
        style={{
          padding: "0 16px 16px",
          borderBottom: "1px solid var(--trella-border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <button style={btnBase} onClick={handleShuffle} aria-label="Shuffle">
          <RefreshIcon label="Shuffle" size="small" />
        </button>
        <div style={{ flex: 1 }} />
        <button
          style={{ ...btnBase, opacity: currentIndex === 0 ? 0.4 : 1 }}
          onClick={handlePrev}
          disabled={currentIndex === 0}
          aria-label="Previous"
        >
          <ArrowLeftIcon label="Previous" size="small" />
        </button>
        <button
          style={{ ...btnBase, opacity: currentIndex >= shuffledMembers.length - 1 ? 0.4 : 1 }}
          onClick={handleNext}
          disabled={currentIndex >= shuffledMembers.length - 1}
          aria-label="Next"
        >
          <ArrowRightIcon label="Next" size="small" />
        </button>
      </div>

      {/* Members list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {shuffledMembers.map((member, idx) => {
          const isActive = idx === currentIndex;
          return (
            <div
              key={member.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 4,
                borderLeft: isActive ? "3px solid #0052CC" : "3px solid transparent",
                background: isActive ? "rgba(0,82,204,0.06)" : "transparent",
                marginBottom: 2,
                cursor: "pointer",
              }}
              onClick={() => setCurrentIndex(idx)}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #0052CC 0%, #6554C0 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--trella-surface)",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {getInitials(member.fullName, member.email)}
              </div>
              <span
                style={{
                  fontSize: 13,
                  color: isActive ? "#0052CC" : "var(--trella-text)",
                  fontWeight: isActive ? 600 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {member.fullName ?? member.email}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: 16, borderTop: "1px solid var(--trella-border)" }}>
        <button
          style={{
            width: "100%",
            height: 36,
            background: "#FF5630",
            color: "var(--trella-surface)",
            border: "none",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={onClose}
        >
          End standup
        </button>
      </div>
    </div>
  );
}
