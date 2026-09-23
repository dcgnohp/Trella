'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Kanban,
  Layers,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  BarChart3,
  FileText,
  ChevronRight,
  Calendar as CalendarIcon,
  Check,
  RefreshCw,
  X,
  Sliders,
  Sun,
  Moon,
  FolderOpen,
  Plus,
  Play,
  RotateCw,
  TrendingUp,
  LayoutGrid,
  Users,
  Search,
  MessageSquare,
  Shield,
  Zap,
  Globe,
  Bell,
  Cpu,
  Star,
  ChevronLeft,
  Lock,
  GitBranch,
  FileCode,
  Send,
  Terminal,
  Command,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  CheckSquare,
} from 'lucide-react';
import { Navbar } from './navbar';
import { CardThumb, FeatureDemo, hasFeatureDemo, type DemoTheme } from './feature-demos';

interface LandingPageClientProps {
  isAuthenticated: boolean;
  dashboardHref: string;
}

/** Wraps the matched substring of `query` inside `text` with a glow highlight. */
function highlightMatch(text: string, query: string, isDarkMode: boolean): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span
        style={{
          backgroundColor: isDarkMode ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.18)',
          color: isDarkMode ? '#DDD6FE' : '#6D28D9',
          borderRadius: 4,
          padding: '0 2px',
        }}
      >
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  );
}

/**
 * Types text out one character at a time with a blinking caret.
 * Re-runs whenever `text` changes. Used across the AI playground so responses
 * feel generated live (Cursor / ChatGPT style) rather than pasted in.
 */
function Typewriter({
  text,
  speed = 16,
  color,
  style,
}: {
  text: string;
  speed?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    if (!text) return;
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  const done = count >= text.length;

  return (
    <span style={{ whiteSpace: 'pre-line', ...style }}>
      {text.slice(0, count)}
      {!done && (
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: '1em',
            marginLeft: 1,
            transform: 'translateY(2px)',
            backgroundColor: color || 'currentColor',
            animation: 'trellaBlink 900ms steps(2) infinite',
          }}
        />
      )}
    </span>
  );
}

interface MatrixFeature {
  id: string;
  category: 'Planning' | 'Tracking' | 'Collaboration' | 'AI Suite' | 'Integration' | 'Administration';
  icon: React.ReactNode;
  title: string;
  description: string;
  tagColor: string;
  details: string[];
}

export function LandingPageClient({ isAuthenticated, dashboardHref }: LandingPageClientProps) {
  // Theme Toggle State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Matrix Filter Tab State
  const [activeMatrixFilter, setActiveMatrixFilter] = useState<string>('All');

  // Interactive Feature Showcase Carousel Index
  const [showcaseIndex, setShowcaseIndex] = useState(0);

  // Selected Feature Modal State
  const [selectedFeature, setSelectedFeature] = useState<MatrixFeature | null>(null);

  // -------------------------------------------------------------------------
  // 1. HERO INTERACTIVE SPRINT 24 MOCKUP STATE
  // -------------------------------------------------------------------------
  const [boardMode, setBoardMode] = useState<'KANBAN' | 'SCRUM'>('KANBAN');
  const [heroSprintTasks, setHeroSprintTasks] = useState([
    { id: '1', title: 'Login Bug Fix', priority: 'URGENT', status: 'TO_DO', points: 4, who: '#3B82F6' },
    { id: '2', title: 'OAuth Refresh Token', priority: 'HIGH', status: 'IN_PROGRESS', points: 8, who: '#8B5CF6' },
    { id: '3', title: 'Billing Timeout Handler', priority: 'MEDIUM', status: 'TO_DO', points: 2, who: '#EC4899' },
    { id: '4', title: 'Gantt Timeline Engine', priority: 'HIGH', status: 'DONE', points: 12, who: '#10B981' },
    { id: '5', title: 'Semantic Search API', priority: 'MEDIUM', status: 'IN_PROGRESS', points: 6, who: '#F59E0B' },
    { id: '6', title: 'Release Notes v2.4', priority: 'LOW', status: 'DONE', points: 3, who: '#06B6D4' },
  ]);

  const toggleHeroTaskStatus = (id: string) => {
    setHeroSprintTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const next = t.status === 'TO_DO' ? 'IN_PROGRESS' : t.status === 'IN_PROGRESS' ? 'DONE' : 'TO_DO';
          return { ...t, status: next };
        }
        return t;
      })
    );
  };

  // -------------------------------------------------------------------------
  // 2. INTERACTIVE AI PLAYGROUND STATE (Cursor/Linear/Notion AI Style)
  // -------------------------------------------------------------------------
  const [aiPlaygroundTab, setAiPlaygroundTab] = useState<'CHAT' | 'SEARCH' | 'SUMMARY' | 'DESCRIPTION' | 'PLANNING'>('CHAT');

  // AI Chat Simulation
  const [chatMessages, setChatMessages] = useState<{ sender: 'USER' | 'AI'; text: string }[]>([
    { sender: 'USER', text: 'How many tasks are overdue in Sprint 24?' },
    {
      sender: 'AI',
      text: 'There are 3 overdue tasks in Sprint 24.\n• Login Bug Fix (High)\n• OAuth Refresh Token (Urgent)\n• Billing Timeout Handler (Medium)\n\nRecommended Action: Reassign 1 task to Backend Team to prevent velocity drop.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSendChatMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatMessages((prev) => [...prev, { sender: 'USER', text: userText }]);
    setChatInput('');
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'AI',
          text: `✨ Trella AI Analysis for "${userText}":\nAnalyzed 24 workspace tasks and 6 documents. Velocity is stable (+14%). Zero blocking dependency vulnerabilities detected.`,
        },
      ]);
    }, 800);
  };

  // AI Search Simulation
  const [searchQuery, setSearchQuery] = useState('auth');
  const [isSearching, setIsSearching] = useState(false);

  const mockSearchResults = [
    { type: 'TASK', title: 'OAuth 2.0 Auth Sync', sprint: 'Sprint 24', pts: 8 },
    { type: 'DOC', title: 'Authentication Architecture Spec v2.0', folder: 'Specs' },
    { type: 'SPRINT', title: 'Sprint 24 (Target: July 30)', progress: '78%' },
    { type: 'MEMBER', title: 'Phong Duc (Lead Security Engineer)', role: 'OWNER' },
  ].filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      searchQuery === ''
  );

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 300);
  };

  // AI Summary Simulation
  const [summaryProgress, setSummaryProgress] = useState(78);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [summaryReport, setSummaryReport] = useState<string | null>(null);

  const handleGenerateSummary = () => {
    setIsGeneratingReport(true);
    setSummaryReport(null);
    setTimeout(() => {
      setIsGeneratingReport(false);
      setSummaryReport(
        '📊 SPRINT HEALTH REPORT:\n• Velocity: 42 Story Points (Target: 45 pts)\n• Completion Rate: 92%\n• Blockers: 0 Active Blockers\n• AI Recommendation: Release Sprint 24 on July 30 as planned.'
      );
    }, 900);
  };

  // AI Description Generator
  const [selectedFeatureToDescribe, setSelectedFeatureToDescribe] = useState('OAuth 2.0 Auth Flow');
  const [generatedDescription, setGeneratedDescription] = useState<string | null>(null);
  const [isDescribing, setIsDescribing] = useState(false);

  const handleGenerateDescription = () => {
    setIsDescribing(true);
    setGeneratedDescription(null);
    setTimeout(() => {
      setIsDescribing(false);
      setGeneratedDescription(
        '### OAuth 2.0 Implementation Spec\n\n**Title**: OAuth 2.0 Authorization Code with PKCE\n\n**Acceptance Criteria**:\n- [x] Authorization code exchange endpoint\n- [x] JWT refresh token auto-rotation\n- [x] RBAC permission guard middleware\n\n**Story Points**: 5 SP (Estimated Duration: 2.5 Days)'
      );
    }, 850);
  };

  // AI Command Center Palette State
  const [commandInput, setCommandInput] = useState('');
  const [commandLogs, setCommandLogs] = useState<string[]>([
    '✓ > summarize sprint 24: Sprint summary generated (78% completed)',
    '✓ > sync jira: 12 issues synchronized with Scrum board',
  ]);

  const commandResponses: Record<string, string> = {
    'summarize sprint 24': 'Sprint summary generated — 78% completed, velocity stable (+14%)',
    'create epic authentication': 'Epic "Authentication" created with 6 seeded stories',
    'sync jira': '12 issues synchronized with the Scrum board',
    'search login bug': 'Found 6 related tasks + 3 docs across the workspace',
    'estimate story points': 'Recommended: 5 SP (based on 4 similar historical tasks)',
  };

  const handleRunCommand = (cmdStr: string) => {
    const clean = cmdStr.trim();
    if (!clean) return;
    const result = commandResponses[clean.toLowerCase()] || 'Command executed successfully';
    setCommandLogs((prev) => [`✓ > ${clean}: ${result}`, ...prev.slice(0, 4)]);
    setCommandInput('');
  };

  // -------------------------------------------------------------------------
  // 3. AI SUMMARY — live "analyzing" progress animation
  // -------------------------------------------------------------------------
  const [analyzeValue, setAnalyzeValue] = useState(0);

  useEffect(() => {
    if (!isGeneratingReport) return;
    setAnalyzeValue(0);
    const id = setInterval(() => {
      setAnalyzeValue((v) => {
        if (v >= 100) {
          clearInterval(id);
          return 100;
        }
        return Math.min(100, v + 8);
      });
    }, 70);
    return () => clearInterval(id);
  }, [isGeneratingReport]);

  // -------------------------------------------------------------------------
  // 4. AI PLANNING — drag/click backlog items into a sprint, AI recommends
  // -------------------------------------------------------------------------
  const planningBacklog = [
    { id: 'payment', title: 'Payment API', points: 8 },
    { id: 'oauth', title: 'OAuth Refresh Flow', points: 5 },
    { id: 'search', title: 'Semantic Search', points: 13 },
    { id: 'billing', title: 'Billing Retry Queue', points: 3 },
  ];
  const [sprintItems, setSprintItems] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [planningResult, setPlanningResult] = useState<string | null>(null);

  const sprintCapacity = 24;
  const sprintUsed = sprintItems.reduce(
    (sum, id) => sum + (planningBacklog.find((b) => b.id === id)?.points ?? 0),
    0
  );

  const addToSprint = (id: string) => {
    if (sprintItems.includes(id)) return;
    setSprintItems((prev) => [...prev, id]);
    setIsCalculating(true);
    setPlanningResult(null);
    setTimeout(() => {
      setIsCalculating(false);
      const used = sprintUsed + (planningBacklog.find((b) => b.id === id)?.points ?? 0);
      const confidence = used <= sprintCapacity ? Math.max(60, 100 - used * 2) : 38;
      setPlanningResult(
        used <= sprintCapacity
          ? `Fits Sprint 25 · Confidence ${confidence}% · No dependency conflicts detected.`
          : `Over capacity by ${used - sprintCapacity} pts · Confidence ${confidence}% · Move 1 item to Sprint 26.`
      );
    }, 700);
  };

  const resetSprint = () => {
    setSprintItems([]);
    setPlanningResult(null);
  };

  // -------------------------------------------------------------------------
  // 5. HOW AI WORKS — cycle the active node so the pipeline "lights up"
  // -------------------------------------------------------------------------
  const flowSteps = ['Ask', 'Search Tasks', 'Search Docs', 'Search Sprint', 'Reason', 'Answer'];
  const [activeFlowNode, setActiveFlowNode] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveFlowNode((n) => (n + 1) % flowSteps.length);
    }, 900);
    return () => clearInterval(id);
  }, [flowSteps.length]);

  // Theme Tokens
  const theme = isDarkMode
    ? {
        bg: '#080B11',
        bgGradient: 'linear-gradient(180deg, #090D16 0%, #0F172A 20%, #17122A 45%, #0B101D 70%, #080B11 100%)',
        text: '#F8FAFC',
        textMuted: '#94A3B8',
        textSubtle: '#64748B',
        cardBg: '#0F172A',
        cardBorder: 'rgba(255, 255, 255, 0.1)',
        cardHoverBorder: '#3B82F6',
        innerBg: '#1E293B',
        accentBlue: '#3B82F6',
        accentPurple: '#8B5CF6',
        navBg: 'rgba(9, 13, 22, 0.85)',
      }
    : {
        bg: '#F8FAFC',
        bgGradient: 'linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 20%, #E0E7FF 45%, #F8FAFC 70%, #FFFFFF 100%)',
        text: '#0F172A',
        textMuted: '#475569',
        textSubtle: '#64748B',
        cardBg: '#FFFFFF',
        cardBorder: '#CBD5E1',
        cardHoverBorder: '#2563EB',
        innerBg: '#F1F5F9',
        accentBlue: '#2563EB',
        accentPurple: '#7C3AED',
        navBg: 'rgba(255, 255, 255, 0.85)',
      };

  const demoTheme: DemoTheme = {
    isDark: isDarkMode,
    text: theme.text,
    textMuted: theme.textMuted,
    cardBg: theme.cardBg,
    innerBg: theme.innerBg,
    border: theme.cardBorder,
  };

  // 16 Core Matrix Features
  const matrixFeatures: MatrixFeature[] = [
    {
      id: 'jira-scrum-sync',
      category: 'Integration',
      icon: <RefreshCw size={20} color="#3B82F6" />,
      title: 'Jira ↔ Scrum Sync',
      description: 'Two-way sync tasks, epics, statuses, comments & attachments in real-time.',
      tagColor: '#3B82F6',
      details: ['Bi-directional task & status synchronization', 'Real-time comment forwarding', 'Conflict detection & resolution', 'Custom field mappings'],
    },
    {
      id: 'ai-search',
      category: 'AI Suite',
      icon: <Search size={20} color="#8B5CF6" />,
      title: 'AI Search',
      description: 'Search across tasks, docs, comments and projects using natural language.',
      tagColor: '#8B5CF6',
      details: ['Natural language semantic search', 'Search across workspace docs & tasks', 'Instant auto-complete with context', 'Filter search results by author'],
    },
    {
      id: 'ai-chat',
      category: 'AI Suite',
      icon: <MessageSquare size={20} color="#EC4899" />,
      title: 'AI Chat Assistant',
      description: 'Chat with AI about your project, tasks, and organization data.',
      tagColor: '#EC4899',
      details: ['Context-aware workspace Q&A', 'Generate code snippets & specs', 'Analyze team velocity trends', 'Draft release notes automatically'],
    },
    {
      id: 'ai-description',
      category: 'AI Suite',
      icon: <FileText size={20} color="#F59E0B" />,
      title: 'AI Task Description',
      description: 'Generate clear, detailed task descriptions instantly with AI.',
      tagColor: '#F59E0B',
      details: ['Auto-generate acceptance criteria', 'Format requirements into structured markdown', 'Extract technical prerequisites', 'Instant 1-click apply'],
    },
    {
      id: 'ai-sprint-summary',
      category: 'AI Suite',
      icon: <BarChart3 size={20} color="#10B981" />,
      title: 'AI Sprint Summary',
      description: 'Get automated sprint summaries, highlights and key insights.',
      tagColor: '#10B981',
      details: ['Sprint retrospective summary generation', 'Highlight completed story points', 'Identify velocity bottlenecks', 'Export executive summary'],
    },
    {
      id: 'ai-suggestions',
      category: 'AI Suite',
      icon: <Sparkles size={20} color="#3B82F6" />,
      title: 'AI Smart Suggestions',
      description: 'AI suggests tasks, owners, estimates and priorities based on context.',
      tagColor: '#3B82F6',
      details: ['Suggest optimal task assignees', 'Predict story point accuracy', 'Recommend subtasks for complex epics', 'Detect duplicate issues'],
    },
    {
      id: 'backlog-management',
      category: 'Planning',
      icon: <Layers size={20} color="#8B5CF6" />,
      title: 'Backlog Management',
      description: 'Create, prioritize and refine your product backlog efficiently.',
      tagColor: '#8B5CF6',
      details: ['Unassigned backlog issue pool', 'Drag-and-drop story prioritization', 'Bulk task assignment & tagging', 'Filter backlog by epic'],
    },
    {
      id: 'sprint-planning',
      category: 'Planning',
      icon: <CalendarIcon size={20} color="#EC4899" />,
      title: 'Sprint Planning',
      description: 'Plan sprints with drag & drop and team capacity awareness.',
      tagColor: '#EC4899',
      details: ['Sprint target date & capacity thresholds', 'Drag issues into active sprint buckets', 'Story point burnup preview', 'Sprint lifecycle triggers'],
    },
    {
      id: 'board-kanban',
      category: 'Tracking',
      icon: <Kanban size={20} color="#3B82F6" />,
      title: 'Board (Kanban)',
      description: 'Visualize workflow with customizable Kanban boards.',
      tagColor: '#3B82F6',
      details: ['Custom column definitions & WIP limits', 'Custom status lozenge mappings', 'Priority tags (Urgent, High, Medium, Low)', 'Subtask checklist progress'],
    },
    {
      id: 'timeline-gantt',
      category: 'Tracking',
      icon: <TrendingUp size={20} color="#10B981" />,
      title: 'Timeline / Gantt',
      description: 'Plan and track work timelines with beautiful Gantt charts.',
      tagColor: '#10B981',
      details: ['1:1 Velocity auto-sync (8 pts = 4 working days)', 'Drag-to-reschedule start and due dates', 'Multi-epic milestone roadmaps', 'Month, Week, Day zooming'],
    },
    {
      id: 'calendar-view',
      category: 'Tracking',
      icon: <CalendarIcon size={20} color="#F59E0B" />,
      title: 'Calendar View',
      description: 'View tasks, sprints and deadlines in a unified calendar.',
      tagColor: '#F59E0B',
      details: ['Month, Week, and Day view switcher', 'Overdue alerts & scheduled task counts', 'One-click Task Detail Drawer integration', 'Rotatable calendar navigation'],
    },
    {
      id: 'team-workload',
      category: 'Collaboration',
      icon: <Users size={20} color="#8B5CF6" />,
      title: 'Team Workload',
      description: 'Balance work across team members with workload view.',
      tagColor: '#8B5CF6',
      details: ['Visual member capacity indicators', 'Identify over-allocated team members', 'Reassign tasks with 1-click drag', 'Workload distribution metrics'],
    },
    {
      id: 'docs-management',
      category: 'Collaboration',
      icon: <FileText size={20} color="#06B6D4" />,
      title: 'Docs Management',
      description: 'Create, organize and share product docs and technical docs.',
      tagColor: '#06B6D4',
      details: ['Rich WYSIWYG & Markdown document editor', 'Knowledge base collection folder hierarchy', 'Task & Epic link embedding', 'Export technical documentation'],
    },
    {
      id: 'reports-analytics',
      category: 'Tracking',
      icon: <BarChart3 size={20} color="#10B981" />,
      title: 'Reports & Analytics',
      description: 'Burndown, velocity, cycle time and custom reports with insights.',
      tagColor: '#10B981',
      details: ['Sprint burndown & velocity trend charts', 'Cumulative flow diagrams', 'Cycle time & lead time analytics', 'Export report charts to CSV/PDF'],
    },
    {
      id: 'organization-management',
      category: 'Administration',
      icon: <Globe size={20} color="#3B82F6" />,
      title: 'Organization Management',
      description: 'Manage organizations, settings, preferences and configurations.',
      tagColor: '#3B82F6',
      details: ['Slack/GitHub style Global Organization Switcher', '100% Real-time database KPI counters', 'Multi-workspace hierarchy', 'Custom workspace branding'],
    },
    {
      id: 'member-permissions',
      category: 'Administration',
      icon: <Users size={20} color="#8B5CF6" />,
      title: 'Member & Permissions',
      description: 'Invite members, manage roles and granular permissions.',
      tagColor: '#8B5CF6',
      details: ['Inline Role Badge editing (OWNER, ADMIN, MEMBER, GUEST)', 'Instant DB persistence for role changes', 'Hover popover workspace access list', 'Granular RBAC permission checks'],
    },
  ];

  const filteredMatrix = matrixFeatures.filter(
    (f) => (activeMatrixFilter === 'All' ? true : f.category === activeMatrixFilter)
  );

  // Showcase Carousel Items
  const showcaseList = [
    {
      id: 'jira-sync',
      demoId: 'jira-scrum-sync',
      title: 'Two-way sync between Jira and Scrum',
      subtitle: 'Change a status on either side and it mirrors instantly — tasks, epics (backlog) and linked docs stay identical. No manual export, no copy-paste, no drift.',
      checklist: ['Edit in Jira OR Scrum — both directions sync', 'Backlog, epics & subtasks kept identical', 'Comments, assignees & attachments carry over', 'Linked docs & specs sync alongside tasks'],
    },
    {
      id: 'gantt-velocity',
      demoId: 'timeline-gantt',
      title: 'Gantt Timeline & 1:1 Velocity Auto-Sync',
      subtitle: 'Every 8 Story Points automatically recalculates to 4 working days (2 pts/day). Bump points on the right and watch the timeline recompute.',
      checklist: ['Drag-to-reschedule start & due dates', 'Automated 1:1 Velocity sync', 'Multi-epic milestone roadmaps', 'Month, Week, Day view zooming'],
    },
    {
      id: 'ai-chat-showcase',
      demoId: 'ai-chat',
      title: 'Ask your workspace anything',
      subtitle: 'The AI assistant reasons across every task, doc and sprint to answer in seconds — try a prompt on the right.',
      checklist: ['Context-aware workspace Q&A', 'Detects blockers & risks automatically', 'Drafts standups & release notes', 'Cites the tasks & docs it used'],
    },
    {
      id: 'kanban-showcase',
      demoId: 'board-kanban',
      title: 'Drag-and-drop Kanban boards',
      subtitle: 'Move work exactly how your team thinks. Real drag & drop across columns — grab a card on the right and try it.',
      checklist: ['Smooth drag & drop across columns', 'WIP limits & custom statuses', 'Priority tags & assignee avatars', 'Subtask checklist progress'],
    },
    {
      id: 'reports-showcase',
      demoId: 'reports-analytics',
      title: 'Reports that draw themselves',
      subtitle: 'Burndown, velocity and status analytics update live. Switch charts and hover the data on the right.',
      checklist: ['Animated burndown & velocity trends', 'Interactive status donut breakdown', 'Cycle time & lead time analytics', 'Export charts to CSV / PDF'],
    },
    {
      id: 'calendar-showcase',
      demoId: 'calendar-view',
      title: 'A calendar for every deadline',
      subtitle: 'See tasks, sprints and releases on one calendar. Click a day on the right to preview its tasks.',
      checklist: ['Month, Week & Day views', 'Task & sprint deadlines in one place', 'Overdue alerts & scheduled counts', 'One-click task detail drawer'],
    },
    {
      id: 'workload-showcase',
      demoId: 'team-workload',
      title: 'Balance the team automatically',
      subtitle: 'Spot overloaded members instantly and let AI rebalance capacity. Try the AI rebalance button on the right.',
      checklist: ['Visual per-member capacity bars', 'Overload detection & warnings', 'AI-suggested rebalancing', 'Workload distribution metrics'],
    },
  ];

  const currentShowcase = showcaseList[showcaseIndex];

  return (
    <div
      style={{
        backgroundColor: theme.bg,
        background: theme.bgGradient,
        color: theme.text,
        minHeight: '100vh',
        fontFamily: 'Inter, sans-serif',
        overflowX: 'hidden',
        transition: 'background 300ms ease, color 300ms ease',
      }}
    >
      {/* Global keyframes for AI playground animations */}
      <style>{`
        @keyframes trellaBlink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes trellaPulse { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
        @keyframes trellaRadar { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(2.4); opacity: 0; } }
        @keyframes trellaFadeUp { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes trellaDot { 0%,80%,100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-4px); opacity: 1; } }
        @keyframes trellaFlow { 0%,100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); } 50% { box-shadow: 0 0 0 4px rgba(139,92,246,0.25); } }
        .trella-fade-up { animation: trellaFadeUp 320ms ease both; }
      `}</style>

      {/* 1. Header Navbar */}
      <Navbar isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode((prev) => !prev)} />

      {/* 2. Hero Section (Enlarged Interactive Sprint 24 Mockup) */}
      <section style={{ padding: '140px 24px 80px', maxWidth: 1340, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.4fr', gap: 48, alignItems: 'center' }}>
          
          {/* Hero Left Content */}
          <div style={{ textAlign: 'left' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 20,
                backgroundColor: 'rgba(37,99,235,0.15)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: '#60A5FA',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: 20,
              }}
            >
              <Sparkles size={14} color="#60A5FA" />
              <span>AI-POWERED AGILE PLATFORM</span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(40px, 4.8vw, 64px)',
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: 1.08,
                margin: '0 0 20px',
                color: isDarkMode ? '#FFFFFF' : theme.text,
              }}
            >
              Agile planning, <br />
              powered by{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                AI
              </span>
            </h1>

            <p style={{ fontSize: 16, color: theme.textMuted, margin: '0 0 28px', lineHeight: 1.6, maxWidth: 480 }}>
              Trella helps engineering teams plan, track, and ship better software — with AI at every step.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
              <Link href={isAuthenticated ? dashboardHref : '/sign-in'} style={{ textDecoration: 'none' }}>
                <button
                  style={{
                    padding: '14px 32px',
                    fontSize: 15,
                    fontWeight: 800,
                    color: '#FFFFFF',
                    background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(37,99,235,0.35)',
                  }}
                >
                  Start free trial
                </button>
              </Link>

              <a href="#ai-playground" style={{ textDecoration: 'none' }}>
                <button
                  style={{
                    padding: '14px 26px',
                    fontSize: 14,
                    fontWeight: 700,
                    color: isDarkMode ? '#FFFFFF' : theme.text,
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                    border: `1px solid ${theme.cardBorder}`,
                    borderRadius: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Sparkles size={16} color="#8B5CF6" />
                  <span>Try AI Playground 👇</span>
                </button>
              </a>
            </div>

            <div style={{ display: 'flex', gap: 20, fontSize: 12, color: theme.textSubtle }}>
              <span>✓ No credit card</span>
              <span>✓ 14-day free trial</span>
              <span>✓ Cancel anytime</span>
            </div>
          </div>

          {/* Hero Right — Interactive Project Board (Kanban) mockup */}
          <div style={{ position: 'relative', paddingBottom: 40 }}>
            <div
              style={{
                backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF',
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: 18,
                padding: 20,
                boxShadow: isDarkMode ? '0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(37,99,235,0.2)' : '0 20px 40px rgba(0,0,0,0.12)',
              }}
            >
              {/* Board top bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 15 }}>T</div>
                  <span style={{ fontSize: 17, fontWeight: 900, color: theme.text }}>
                    {boardMode === 'KANBAN' ? 'Project Board' : 'Sprint 24'}
                  </span>
                  <Star size={14} color="#F59E0B" fill="#F59E0B" />
                </div>
                {/* Kanban / Scrum mode toggle */}
                <div style={{ display: 'flex', backgroundColor: theme.innerBg, borderRadius: 8, padding: 3, border: `1px solid ${theme.cardBorder}` }}>
                  {(['KANBAN', 'SCRUM'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setBoardMode(m)}
                      style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800, backgroundColor: boardMode === m ? '#3B82F6' : 'transparent', color: boardMode === m ? '#fff' : theme.textMuted }}
                    >
                      {m === 'KANBAN' ? 'Kanban' : 'Scrum'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Board columns */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { key: 'TO_DO', label: boardMode === 'SCRUM' ? 'Backlog' : 'To Do', color: '#F59E0B' },
                  { key: 'IN_PROGRESS', label: 'In Progress', color: '#3B82F6' },
                  { key: 'DONE', label: 'Done', color: '#10B981' },
                ].map((col) => {
                  const cards = heroSprintTasks.filter((t) => t.status === col.key);
                  return (
                    <div key={col.key} style={{ backgroundColor: theme.innerBg, borderRadius: 10, padding: 8, minHeight: 230 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '2px 4px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: theme.text }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: col.color }} />
                          {col.label}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, backgroundColor: isDarkMode ? 'rgba(0,0,0,0.3)' : '#fff', padding: '1px 7px', borderRadius: 10 }}>{cards.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {cards.map((t) => (
                          <div
                            key={t.id}
                            onClick={() => toggleHeroTaskStatus(t.id)}
                            className="trella-fade-up"
                            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, padding: 10, cursor: 'pointer', transition: 'transform 120ms ease' }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = col.color; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = theme.cardBorder; }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 8, lineHeight: 1.3 }}>{t.title}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 4, color: t.priority === 'URGENT' ? '#EF4444' : t.priority === 'HIGH' ? '#F59E0B' : '#3B82F6', backgroundColor: t.priority === 'URGENT' ? 'rgba(239,68,68,0.12)' : t.priority === 'HIGH' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)' }}>{t.priority}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted }}>{t.points} SP</span>
                                <span style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: t.who }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, marginTop: 10, textAlign: 'center' }}>👆 Click a card to move it across columns</div>
            </div>

            {/* Floating: Workspace mode toggle chip */}
            <div
              className="trella-fade-up"
              style={{ position: 'absolute', top: -18, left: -14, backgroundColor: isDarkMode ? '#111827' : '#FFFFFF', border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: '8px 12px', boxShadow: '0 12px 30px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <LayoutGrid size={14} color="#3B82F6" />
              <span style={{ fontSize: 11, fontWeight: 800, color: theme.text }}>Workspace mode</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#8B5CF6' }}>{boardMode === 'KANBAN' ? 'Kanban' : 'Scrum'} ▾</span>
            </div>

            {/* Floating: AI insight panel (replaces "real-time velocity") */}
            <div
              className="trella-fade-up"
              style={{ position: 'absolute', bottom: -6, right: -16, width: 250, backgroundColor: isDarkMode ? 'rgba(17,24,39,0.96)' : '#FFFFFF', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 14, padding: 14, boxShadow: '0 16px 40px rgba(124,58,237,0.3)', backdropFilter: 'blur(6px)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Sparkles size={14} color="#8B5CF6" />
                <span style={{ fontSize: 12, fontWeight: 900, color: theme.text }}>AI Insight</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: '#10B981', backgroundColor: 'rgba(16,185,129,0.15)', padding: '2px 7px', borderRadius: 8 }}>LIVE</span>
              </div>
              <div style={{ fontSize: 11, color: theme.text, lineHeight: 1.45, marginBottom: 8 }}>
                <strong style={{ color: '#8B5CF6' }}>Login Bug Fix</strong> is at risk — assignee is over capacity. Suggest moving <strong>Billing Handler</strong> to next sprint.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.12)', padding: '3px 8px', borderRadius: 6 }}>92% confidence</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: theme.textMuted, backgroundColor: theme.innerBg, padding: '3px 8px', borderRadius: 6 }}>Auto-detected</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 3. Trusted By Logos */}
      <section style={{ borderTop: `1px solid ${theme.cardBorder}`, borderBottom: `1px solid ${theme.cardBorder}`, padding: '24px', backgroundColor: theme.innerBg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: theme.textSubtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            TRUSTED BY MODERN TEAMS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, flexWrap: 'wrap', opacity: 0.6, fontSize: 18, fontWeight: 900, color: theme.text }}>
            <span>Google</span>
            <span>Microsoft</span>
            <span>Amazon</span>
            <span>Slack</span>
            <span>Airbnb</span>
            <span>Shopify</span>
            <span>Samsung</span>
          </div>
        </div>
      </section>

      {/* 4. INTERACTIVE AI WORKSPACE PLAYGROUND (Cursor / Notion AI Style) */}
      <section id="ai-playground" style={{ padding: '80px 24px', maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#8B5CF6', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            AI WORKSPACE PLAYGROUND
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: theme.text, margin: '0 0 10px' }}>
            Try every AI feature directly in your browser
          </h2>
          <p style={{ fontSize: 15, color: theme.textMuted, margin: 0 }}>
            Don’t just read about AI. Test live interactive prompts right here — no login required.
          </p>
        </div>

        {/* Mini App Fake App Container */}
        <div style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
          
          {/* Top Fake App Navigation Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', backgroundColor: theme.innerBg, borderBottom: `1px solid ${theme.cardBorder}` }}>
            {[
              { key: 'CHAT', label: 'AI Chat', icon: <MessageSquare size={16} color="#EC4899" /> },
              { key: 'SEARCH', label: 'AI Search', icon: <Search size={16} color="#8B5CF6" /> },
              { key: 'SUMMARY', label: 'AI Summary', icon: <BarChart3 size={16} color="#10B981" /> },
              { key: 'DESCRIPTION', label: 'AI Description', icon: <FileText size={16} color="#F59E0B" /> },
              { key: 'PLANNING', label: 'AI Planning', icon: <Sparkles size={16} color="#3B82F6" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setAiPlaygroundTab(tab.key as any)}
                style={{
                  padding: '14px 10px',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  backgroundColor: aiPlaygroundTab === tab.key ? (isDarkMode ? '#0F172A' : '#FFFFFF') : 'transparent',
                  color: aiPlaygroundTab === tab.key ? theme.text : theme.textMuted,
                  borderBottom: aiPlaygroundTab === tab.key ? '3px solid #8B5CF6' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 120ms ease',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Playground Main Content Window */}
          <div style={{ padding: 24, minHeight: 380, backgroundColor: isDarkMode ? '#0B101D' : '#F8FAFC' }}>
            
            {/* AI CHAT TAB */}
            {aiPlaygroundTab === 'CHAT' && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, maxHeight: 240, overflowY: 'auto' }}>
                  {chatMessages.map((msg, i) => {
                    const isLastAi = msg.sender === 'AI' && i === chatMessages.length - 1;
                    return (
                      <div key={i} className="trella-fade-up" style={{ alignSelf: msg.sender === 'USER' ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                        <div
                          style={{
                            padding: '10px 16px',
                            borderRadius: 12,
                            fontSize: 13,
                            lineHeight: 1.5,
                            backgroundColor: msg.sender === 'USER' ? '#3B82F6' : theme.cardBg,
                            color: msg.sender === 'USER' ? '#FFFFFF' : theme.text,
                            border: msg.sender === 'AI' ? `1px solid ${theme.cardBorder}` : 'none',
                            whiteSpace: 'pre-line',
                          }}
                        >
                          {isLastAi ? <Typewriter text={msg.text} color="#8B5CF6" /> : msg.text}
                        </div>
                      </div>
                    );
                  })}
                  {isTyping && (
                    <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                      {[0, 1, 2].map((d) => (
                        <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#8B5CF6', animation: `trellaDot 1s ${d * 0.15}s infinite` }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick prompt chips */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {['Summarize Sprint 24', 'What is blocked?', 'Draft release notes'].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setChatInput(q); }}
                      style={{ padding: '5px 12px', borderRadius: 16, border: `1px solid ${theme.cardBorder}`, backgroundColor: theme.cardBg, color: theme.textMuted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSendChatMessage} style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Trella AI anything... (e.g. How many tasks are overdue?)"
                    style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: `1px solid ${theme.cardBorder}`, backgroundColor: theme.cardBg, color: theme.text, fontSize: 13, outline: 'none' }}
                  />
                  <button type="submit" style={{ padding: '12px 20px', borderRadius: 10, backgroundColor: '#8B5CF6', color: '#FFFFFF', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
                    Send
                  </button>
                </form>
              </div>
            )}

            {/* AI SEARCH TAB */}
            {aiPlaygroundTab === 'SEARCH' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={18} color={theme.textMuted} style={{ position: 'absolute', left: 14, top: 14 }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search tasks, docs, sprints, members with AI..."
                      style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: 10, border: `1px solid ${theme.cardBorder}`, backgroundColor: theme.cardBg, color: theme.text, fontSize: 13, outline: 'none' }}
                    />
                  </div>
                </div>

                {isSearching ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 16 }}>
                    <div style={{ position: 'relative', width: 40, height: 40 }}>
                      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #8B5CF6', animation: 'trellaRadar 1.2s ease-out infinite' }} />
                      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #3B82F6', animation: 'trellaRadar 1.2s ease-out 0.6s infinite' }} />
                      <Search size={20} color="#8B5CF6" style={{ position: 'absolute', top: 10, left: 10 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: theme.accentBlue }}>Scanning workspace…</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 10 }}>
                      Found {mockSearchResults.length} result{mockSearchResults.length === 1 ? '' : 's'}
                      {searchQuery ? <> for “<span style={{ color: '#8B5CF6' }}>{searchQuery}</span>”</> : null}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                      {mockSearchResults.map((res, idx) => (
                        <div key={idx} className="trella-fade-up" style={{ animationDelay: `${idx * 70}ms`, backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 10, padding: 12, textAlign: 'left' }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#8B5CF6', textTransform: 'uppercase' }}>✓ {res.type}</span>
                          <div style={{ fontSize: 13, fontWeight: 800, color: theme.text, margin: '4px 0 2px' }}>
                            {highlightMatch(res.title, searchQuery, isDarkMode)}
                          </div>
                          <div style={{ fontSize: 11, color: theme.textMuted }}>{(res as any).sprint || (res as any).folder || (res as any).progress || (res as any).role}</div>
                        </div>
                      ))}
                      {mockSearchResults.length === 0 && (
                        <div style={{ fontSize: 13, color: theme.textMuted, padding: 12 }}>No matches — try “auth”, “sprint” or “doc”.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI SUMMARY TAB */}
            {aiPlaygroundTab === 'SUMMARY' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: theme.text }}>Sprint 24 Health & Summary</h4>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>28 / 36 Story Points Completed</div>
                  </div>
                  <button onClick={handleGenerateSummary} style={{ padding: '8px 18px', borderRadius: 8, backgroundColor: '#10B981', color: '#FFFFFF', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
                    Generate Summary Report ✨
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 16 }}>
                  {/* Sprint health gauge */}
                  <div style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700, marginBottom: 8 }}>Sprint Health</div>
                    <div style={{ fontSize: 40, fontWeight: 900, color: '#10B981', lineHeight: 1 }}>92%</div>
                    <div style={{ marginTop: 12, width: '100%', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
                      <span style={{ color: '#10B981' }}>✓ Velocity stable</span>
                      <span style={{ color: '#10B981' }}>✓ No blockers</span>
                      <span style={{ color: '#F59E0B' }}>⚠ API deploy +1d</span>
                    </div>
                  </div>

                  {/* Report / analysis panel */}
                  <div style={{ backgroundColor: theme.cardBg, padding: 16, borderRadius: 10, border: `1px solid ${theme.cardBorder}`, minHeight: 150 }}>
                    {isGeneratingReport ? (
                      <div>
                        <div style={{ fontSize: 13, color: '#10B981', fontWeight: 800, marginBottom: 10 }}>AI is analyzing Sprint 24… {analyzeValue}%</div>
                        <div style={{ height: 8, borderRadius: 6, backgroundColor: theme.innerBg, overflow: 'hidden' }}>
                          <div style={{ width: `${analyzeValue}%`, height: '100%', borderRadius: 6, background: 'linear-gradient(90deg,#10B981,#3B82F6)', transition: 'width 70ms linear' }} />
                        </div>
                      </div>
                    ) : summaryReport ? (
                      <Typewriter text={summaryReport} color="#10B981" style={{ fontSize: 13, color: theme.text, lineHeight: 1.6 }} />
                    ) : (
                      <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.6 }}>
                        Click <strong>Generate Summary Report</strong> to let Trella AI analyze velocity, completion rate and blockers, then draft an executive summary.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* AI DESCRIPTION TAB */}
            {aiPlaygroundTab === 'DESCRIPTION' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: theme.text }}>AI Acceptance Criteria Generator</h4>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>Selected Task: OAuth 2.0 Implementation</div>
                  </div>
                  <button onClick={handleGenerateDescription} style={{ padding: '8px 18px', borderRadius: 8, backgroundColor: '#F59E0B', color: '#FFFFFF', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
                    Generate Description ✨
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {['OAuth 2.0 Auth Flow', 'Payment Retry Queue', 'Semantic Search API'].map((f) => (
                    <button
                      key={f}
                      onClick={() => { setSelectedFeatureToDescribe(f); setGeneratedDescription(null); }}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 16,
                        border: `1px solid ${selectedFeatureToDescribe === f ? '#F59E0B' : theme.cardBorder}`,
                        backgroundColor: selectedFeatureToDescribe === f ? 'rgba(245,158,11,0.15)' : theme.cardBg,
                        color: selectedFeatureToDescribe === f ? '#F59E0B' : theme.textMuted,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div style={{ backgroundColor: theme.cardBg, padding: 16, borderRadius: 10, border: `1px solid ${theme.cardBorder}`, minHeight: 150 }}>
                  {isDescribing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F59E0B', fontWeight: 700 }}>
                      {[0, 1, 2].map((d) => (
                        <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#F59E0B', animation: `trellaDot 1s ${d * 0.15}s infinite` }} />
                      ))}
                      <span>Drafting acceptance criteria for {selectedFeatureToDescribe}…</span>
                    </div>
                  ) : generatedDescription ? (
                    <Typewriter text={generatedDescription} color="#F59E0B" style={{ fontSize: 13, color: theme.text, lineHeight: 1.6 }} />
                  ) : (
                    <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.6 }}>
                      Pick a feature above, then hit <strong>Generate Description</strong> — AI drafts a title, acceptance criteria, priority and story-point estimate.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI PLANNING TAB */}
            {aiPlaygroundTab === 'PLANNING' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: theme.text }}>AI Predictive Sprint Planning</h4>
                  <button onClick={resetSprint} style={{ padding: '6px 12px', borderRadius: 8, backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Reset</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* Backlog */}
                  <div style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>Backlog · click to add ↦</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {planningBacklog.filter((b) => !sprintItems.includes(b.id)).map((b) => (
                        <button
                          key={b.id}
                          onClick={() => addToSprint(b.id)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, backgroundColor: theme.innerBg, color: theme.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                        >
                          <span>{b.title}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.15)', padding: '2px 8px', borderRadius: 6 }}>{b.points} SP</span>
                        </button>
                      ))}
                      {planningBacklog.every((b) => sprintItems.includes(b.id)) && (
                        <div style={{ fontSize: 12, color: theme.textMuted, padding: 8 }}>Backlog empty — all items planned.</div>
                      )}
                    </div>
                  </div>

                  {/* Sprint 25 bucket */}
                  <div style={{ backgroundColor: theme.cardBg, border: `1px solid ${sprintUsed > sprintCapacity ? '#EF4444' : theme.cardBorder}`, borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800, color: theme.textMuted, marginBottom: 8 }}>
                      <span style={{ textTransform: 'uppercase' }}>Sprint 25</span>
                      <span style={{ color: sprintUsed > sprintCapacity ? '#EF4444' : '#10B981' }}>{sprintUsed} / {sprintCapacity} SP</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 6, backgroundColor: theme.innerBg, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ width: `${Math.min(100, (sprintUsed / sprintCapacity) * 100)}%`, height: '100%', borderRadius: 6, backgroundColor: sprintUsed > sprintCapacity ? '#EF4444' : '#10B981', transition: 'width 300ms ease' }} />
                    </div>

                    {sprintItems.length === 0 ? (
                      <div style={{ fontSize: 12, color: theme.textMuted, border: `1px dashed ${theme.cardBorder}`, borderRadius: 8, padding: 16, textAlign: 'center' }}>
                        Add a backlog item to see the AI recommendation
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                        {sprintItems.map((id) => {
                          const b = planningBacklog.find((x) => x.id === id)!;
                          return (
                            <div key={id} className="trella-fade-up" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: theme.text, backgroundColor: theme.innerBg, borderRadius: 6, padding: '6px 10px' }}>
                              <span>{b.title}</span><span style={{ color: theme.textMuted }}>{b.points} SP</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {isCalculating && (
                      <div style={{ fontSize: 12, color: '#3B82F6', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {[0, 1, 2].map((d) => (
                          <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#3B82F6', animation: `trellaDot 1s ${d * 0.15}s infinite` }} />
                        ))}
                        <span>AI calculating fit…</span>
                      </div>
                    )}
                    {!isCalculating && planningResult && (
                      <div className="trella-fade-up" style={{ fontSize: 12, color: theme.text, backgroundColor: isDarkMode ? 'rgba(59,130,246,0.12)' : '#EFF6FF', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: 10, lineHeight: 1.5 }}>
                        <strong style={{ color: '#3B82F6' }}>AI recommendation:</strong> {planningResult}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* AI COMMAND CENTER PALETTE (Cursor / Linear Style) */}
          <div style={{ backgroundColor: theme.innerBg, borderTop: `1px solid ${theme.cardBorder}`, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#8B5CF6', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Command size={14} />
              <span>⚡ AI COMMAND CENTER — type a command or click one below</span>
            </div>

            {/* Command Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); handleRunCommand(commandInput); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, padding: '8px 12px' }}
            >
              <Terminal size={15} color="#8B5CF6" />
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="e.g. summarize sprint 24"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: theme.text, fontSize: 13, fontFamily: 'monospace' }}
              />
              <button type="submit" style={{ padding: '4px 12px', borderRadius: 6, backgroundColor: '#8B5CF6', color: '#FFFFFF', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Run</button>
            </form>

            {/* Quick Command Buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {['summarize sprint 24', 'create epic authentication', 'sync jira', 'search login bug', 'estimate story points'].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => handleRunCommand(cmd)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: `1px solid ${theme.cardBorder}`,
                    backgroundColor: theme.cardBg,
                    color: theme.text,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  &gt; {cmd}
                </button>
              ))}
            </div>

            {/* Command Log Terminal Output */}
            <div style={{ backgroundColor: isDarkMode ? '#000000' : '#1E293B', color: '#A7F3D0', padding: 10, borderRadius: 6, fontSize: 11, fontFamily: 'monospace' }}>
              {commandLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          </div>

        </div>

        {/* HOW AI WORKS — pipeline that lights up node by node */}
        <div style={{ marginTop: 56, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#8B5CF6', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            HOW AI WORKS
          </div>
          <h3 style={{ fontSize: 26, fontWeight: 900, color: theme.text, margin: '0 0 28px' }}>
            One question, a full workspace reasoning pass
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            {flowSteps.map((step, i) => {
              const active = i === activeFlowNode;
              const passed = i < activeFlowNode;
              const accent = active ? '#8B5CF6' : passed ? '#3B82F6' : theme.textMuted;
              return (
                <React.Fragment key={step}>
                  <div
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      color: active ? '#FFFFFF' : accent,
                      backgroundColor: active ? '#8B5CF6' : theme.cardBg,
                      border: `1px solid ${active ? '#8B5CF6' : theme.cardBorder}`,
                      animation: active ? 'trellaFlow 900ms ease' : 'none',
                      transition: 'all 200ms ease',
                    }}
                  >
                    {step}
                  </div>
                  {i < flowSteps.length - 1 && (
                    <ArrowRight size={16} color={i < activeFlowNode ? '#3B82F6' : theme.textSubtle} style={{ transition: 'color 200ms ease' }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. 16-GRID CORE FEATURE MATRIX WITH FILTER TABS */}
      <section id="features" style={{ padding: '60px 24px 80px', maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            CORE FEATURES
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: theme.text, margin: '0 0 10px' }}>
            A complete platform for agile teams
          </h2>
        </div>

        {/* Category Filter Tabs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
          {['All', 'Planning', 'Tracking', 'Collaboration', 'AI Suite', 'Integration', 'Administration'].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveMatrixFilter(cat)}
              style={{
                padding: '7px 16px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeMatrixFilter === cat ? '#3B82F6' : theme.innerBg,
                color: activeMatrixFilter === cat ? '#FFFFFF' : theme.textMuted,
                transition: 'all 120ms ease',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 16 Bento Cards Matrix */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {filteredMatrix.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedFeature(item)}
              style={{
                backgroundColor: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: 14,
                padding: 20,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'transform 150ms ease, border-color 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.borderColor = item.tagColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.borderColor = theme.cardBorder;
              }}
            >
              <CardThumb id={item.id} t={demoTheme} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: theme.innerBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: theme.text, margin: 0 }}>{item.title}</h3>
              </div>
              <p style={{ fontSize: 12, color: theme.textMuted, margin: '0 0 10px', lineHeight: 1.5 }}>{item.description}</p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, color: '#8B5CF6' }}>
                <Play size={10} /> Live demo inside
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 6. FEATURE SHOWCASE CAROUSEL (Slide-Specific Interactive Mockups) */}
      <section style={{ padding: '60px 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 20, padding: 32, position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 32, alignItems: 'center' }}>
            
            {/* Carousel Left Text */}
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                FEATURE SHOWCASE
              </div>
              <h3 style={{ fontSize: 26, fontWeight: 900, color: theme.text, margin: '0 0 10px' }}>
                {currentShowcase.title}
              </h3>
              <p style={{ fontSize: 14, color: theme.textMuted, margin: '0 0 20px', lineHeight: 1.6 }}>
                {currentShowcase.subtitle}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {currentShowcase.checklist.map((chk, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.text }}>
                    <CheckCircle2 size={16} color="#10B981" />
                    <span>{chk}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Carousel Right — unique interactive demo per slide */}
            <div key={currentShowcase.demoId} className="trella-fade-up" style={{ backgroundColor: theme.innerBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 20, minHeight: 300 }}>
              <FeatureDemo id={currentShowcase.demoId} t={demoTheme} />
            </div>

          </div>

          {/* Carousel Navigation Arrows */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
            <button onClick={() => setShowcaseIndex((prev) => (prev === 0 ? showcaseList.length - 1 : prev - 1))} style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: theme.innerBg, border: 'none', color: theme.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setShowcaseIndex((prev) => (prev + 1) % showcaseList.length)} style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: theme.innerBg, border: 'none', color: theme.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* 7. Social Proof Metrics */}
      <section style={{ borderTop: `1px solid ${theme.cardBorder}`, borderBottom: `1px solid ${theme.cardBorder}`, padding: '60px 24px', backgroundColor: theme.innerBg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
          <h3 style={{ fontSize: 28, fontWeight: 900, color: theme.text, margin: '0 0 8px' }}>Loved by teams worldwide</h3>
          <p style={{ fontSize: 14, color: theme.textMuted, margin: '0 0 40px' }}>Join thousands of engineering teams building better software with Trella.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
            {[
              { val: '10K+', label: 'Active teams' },
              { val: '250K+', label: 'Projects managed' },
              { val: '2M+', label: 'Tasks completed' },
              { val: '99.9%', label: 'Uptime' },
              { val: '4.9/5 ⭐', label: 'G2 Rating' },
            ].map((st, i) => (
              <div key={i} style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#3B82F6' }}>{st.val}</div>
                <div style={{ fontSize: 13, color: theme.textMuted }}>{st.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Feature Detail Popup Modal */}
      {selectedFeature && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setSelectedFeature(null)}
        >
          <div style={{ backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF', borderRadius: 16, maxWidth: 720, width: '100%', maxHeight: '88vh', overflowY: 'auto', border: `1px solid ${theme.cardBorder}`, padding: 28, position: 'relative', color: theme.text }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedFeature(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
              <X size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: theme.innerBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selectedFeature.icon}
              </div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: theme.text }}>{selectedFeature.title}</h3>
            </div>
            <p style={{ fontSize: 14, color: theme.textMuted, lineHeight: 1.6, marginBottom: 18 }}>{selectedFeature.description}</p>

            {/* Interactive mini-demo (unique per feature) */}
            {hasFeatureDemo(selectedFeature.id) && (
              <div style={{ backgroundColor: isDarkMode ? '#0B101D' : '#F8FAFC', border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#8B5CF6', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Live demo · try it</div>
                <FeatureDemo id={selectedFeature.id} t={demoTheme} />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedFeature.details.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.text }}>
                  <CheckCircle2 size={16} color="#10B981" />
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 9. Full Enterprise Footer */}
      <footer style={{ borderTop: `1px solid ${theme.cardBorder}`, padding: '60px 24px 30px', backgroundColor: isDarkMode ? '#05070D' : '#F1F5F9', textAlign: 'left' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.5fr repeat(4, 1fr)', gap: 32, marginBottom: 40 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: 'linear-gradient(135deg,#3B82F6,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: 13 }}>T</div>
              <span style={{ fontSize: 18, fontWeight: 900, color: theme.text }}>Trella</span>
            </div>
            <p style={{ fontSize: 13, color: theme.textSubtle, lineHeight: 1.6, maxWidth: 260 }}>
              AI-powered agile planning platform for modern engineering teams.
            </p>
          </div>

          <div>
            <h5 style={{ fontSize: 13, fontWeight: 800, color: theme.text, marginBottom: 12 }}>Product</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: theme.textMuted }}>
              <span>Features</span>
              <span>AI Suite</span>
              <span>Integrations</span>
              <span>Roadmap</span>
              <span>Changelog</span>
            </div>
          </div>

          <div>
            <h5 style={{ fontSize: 13, fontWeight: 800, color: theme.text, marginBottom: 12 }}>Resources</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: theme.textMuted }}>
              <span>Documentation</span>
              <span>Guides</span>
              <span>Blog</span>
              <span>Help Center</span>
              <span>API Reference</span>
            </div>
          </div>

          <div>
            <h5 style={{ fontSize: 13, fontWeight: 800, color: theme.text, marginBottom: 12 }}>Company</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: theme.textMuted }}>
              <span>About Us</span>
              <span>Careers</span>
              <span>Contact</span>
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
            </div>
          </div>

          <div>
            <h5 style={{ fontSize: 13, fontWeight: 800, color: theme.text, marginBottom: 12 }}>Enterprise</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: theme.textMuted }}>
              <span>Security</span>
              <span>Compliance</span>
              <span>SLA</span>
              <span>Pricing</span>
              <span>On-premise</span>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1240, margin: '0 auto', borderTop: `1px solid ${theme.cardBorder}`, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: theme.textSubtle }}>
          <span>© 2026 Trella Inc. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>Privacy</span>
            <span>Terms</span>
            <span>Security</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
