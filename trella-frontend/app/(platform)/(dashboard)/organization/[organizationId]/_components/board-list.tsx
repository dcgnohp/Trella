'use client';

import Link from "next/link";
import type { BoardPublic } from "@/lib/client";
import { FormPopover } from "@/components/form/form-popover";

interface BoardListProps {
  boards: BoardPublic[];
  isPro?: boolean;
}

export const BoardList = ({ boards, isPro = false }: BoardListProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#5E6C84' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
        </svg>
        Your boards
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {boards.map((board) => (
          <BoardCard key={board.id} board={board} />
        ))}
        <FormPopover sideOffset={10} side="right">
          <div
            role="button"
            style={{
              aspectRatio: '16/9',
              borderRadius: 6,
              backgroundColor: '#F4F5F7',
              border: '1px dashed #DFE1E6',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, cursor: 'pointer', transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(9,30,66,0.08)'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = '#F4F5F7'}
          >
            <span style={{ fontSize: 13, color: '#5E6C84' }}>Create new board</span>
            <span style={{ fontSize: 11, color: '#97A0AF' }}>{isPro ? 'Unlimited' : 'Free workspace'}</span>
          </div>
        </FormPopover>
      </div>
    </div>
  );
};

function BoardCard({ board }: { board: BoardPublic }) {
  const bgColor = board.imageThumbUrl ? undefined : '#0052CC';
  return (
    <Link
      href={`/workspaces/${board.orgId}/boards/${board.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        style={{
          aspectRatio: '16/9',
          borderRadius: 6,
          backgroundColor: bgColor,
          backgroundImage: board.imageThumbUrl ? `url(${board.imageThumbUrl})` : 'linear-gradient(135deg,#0052CC,#6554C0)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).querySelector('.overlay')!.setAttribute('style', 'position:absolute;inset:0;background:rgba(0,0,0,0.45)'); }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).querySelector('.overlay')!.setAttribute('style', 'position:absolute;inset:0;background:rgba(0,0,0,0.25)'); }}
      >
        <div className="overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', transition: 'background 0.12s' }} />
        <span style={{ position: 'relative', zIndex: 1, padding: '8px 10px', display: 'block', fontSize: 13, fontWeight: 600, color: '#fff' }}>
          {board.title}
        </span>
      </div>
    </Link>
  );
}

BoardList.Skeleton = function SkeletonBoardList() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ aspectRatio: '16/9', borderRadius: 6, backgroundColor: '#DFE1E6' }} />
      ))}
    </div>
  );
};
