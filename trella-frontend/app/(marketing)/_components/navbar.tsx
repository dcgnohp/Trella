"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { getLastVisitedCookie, lastVisitedHref } from "@/lib/last-visited";
import { Sun, Moon } from "lucide-react";

interface NavbarProps {
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
}

export const Navbar = ({ isDarkMode = true, onToggleTheme }: NavbarProps) => {
  const { isAuthenticated } = useAuth();
  const dashboardHref = lastVisitedHref(getLastVisitedCookie());

  return (
    <header
      style={{
        position: 'fixed',
        top: 16,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 16px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          maxWidth: 1100,
          width: '100%',
          height: 54,
          borderRadius: 40,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Brand Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 900,
              boxShadow: '0 2px 10px rgba(59,130,246,0.4)',
            }}
          >
            T
          </div>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em' }}>Trella</span>
        </Link>

        {/* Center Nav Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 14, fontWeight: 600 }}>
          <a href="#demo" style={{ color: 'rgba(255, 255, 255, 0.85)', textDecoration: 'none', transition: 'color 120ms' }} onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)'}>
            Features
          </a>
          <a href="#pricing" style={{ color: 'rgba(255, 255, 255, 0.85)', textDecoration: 'none', transition: 'color 120ms' }} onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)'}>
            Workflows
          </a>
          <a href="#docs" style={{ color: 'rgba(255, 255, 255, 0.85)', textDecoration: 'none', transition: 'color 120ms' }} onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)'}>
            Enterprise
          </a>
        </nav>

        {/* Action Buttons: Dark/Light Mode Pill + Go to Dashboard */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#FFFFFF',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {isDarkMode ? <Moon size={14} color="#A7F3D0" /> : <Sun size={14} color="#F59E0B" />}
              <span>{isDarkMode ? 'Dark Mode' : 'Light Mode'}</span>
            </button>
          )}

          <Link href={isAuthenticated ? dashboardHref : '/sign-in'} style={{ textDecoration: 'none' }}>
            <button
              style={{
                padding: '8px 20px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 800,
                color: '#FFFFFF',
                backgroundColor: '#3B82F6',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
                transition: 'all 120ms ease',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563EB'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3B82F6'}
            >
              {isAuthenticated ? 'Go to Dashboard' : 'Sign In'}
            </button>
          </Link>
        </div>

      </div>
    </header>
  );
};
