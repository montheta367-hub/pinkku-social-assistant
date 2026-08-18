import React, { useState } from 'react';
import { PlatformConnection } from '../types';
import { PlatformLogo } from './PlatformLogo';

// ---------------------------------------------------------------------------
// Posts by Status — single-series magnitude bar chart
// ---------------------------------------------------------------------------
interface PostsStatusBarChartProps {
  data: { label: string; value: number }[];
  accentColor?: string;
}

function roundedTopBarPath(x: number, top: number, width: number, baseline: number, radius: number) {
  const r = Math.min(radius, width / 2, Math.max(baseline - top, 0));
  if (r <= 0) {
    return `M${x},${baseline} L${x},${top} L${x + width},${top} L${x + width},${baseline} Z`;
  }
  return `M${x},${baseline} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + width - r},${top} Q${x + width},${top} ${x + width},${top + r} L${x + width},${baseline} Z`;
}

export const PostsStatusBarChart: React.FC<PostsStatusBarChartProps> = ({ data, accentColor = '#FF2D85' }) => {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((acc, d) => acc + d.value, 0);

  if (total === 0) {
    return (
      <div className="h-[168px] flex items-center justify-center text-center px-4">
        <p className="text-xs text-slate-400 font-medium">No posts yet — create one to see your status breakdown here.</p>
      </div>
    );
  }

  const chartH = 120;
  const baseline = chartH;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW = 24;
  const gap = 46;
  const chartW = data.length * gap;
  const activeDatum = active !== null ? data[active] : null;

  return (
    <div>
      <div className="h-4 mb-1 text-[11px] font-bold text-slate-500">
        {activeDatum ? `${activeDatum.label}: ${activeDatum.value} post${activeDatum.value === 1 ? '' : 's'}` : ' '}
      </div>
      <svg viewBox={`0 0 ${chartW} ${chartH + 24}`} className="w-full h-[140px]" role="img" aria-label="Posts by status">
        <line x1={0} y1={baseline} x2={chartW} y2={baseline} stroke="#e2e8f0" strokeWidth={1} />
        {data.map((d, i) => {
          const h = (d.value / maxVal) * (chartH - 16);
          const x = i * gap + (gap - barW) / 2;
          const top = baseline - h;
          const isActive = active === i;
          return (
            <g
              key={d.label}
              tabIndex={0}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              style={{ cursor: 'pointer', outline: 'none' }}
              aria-label={`${d.label}: ${d.value} posts`}
            >
              <rect x={x - 6} y={0} width={barW + 12} height={chartH} fill="transparent" />
              {d.value > 0 && (
                <path
                  d={roundedTopBarPath(x, top, barW, baseline, 4)}
                  fill={accentColor}
                  opacity={isActive ? 1 : 0.85}
                />
              )}
              <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize="11" fontWeight={800} fill="#0f172a">
                {d.value}
              </text>
              <text x={x + barW / 2} y={chartH + 18} textAnchor="middle" fontSize="10" fontWeight={700} fill="#64748b">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Audience by Channel — part-to-whole donut using each platform's brand color
// ---------------------------------------------------------------------------
interface ChannelAudienceDonutProps {
  connections: PlatformConnection[];
}

export const ChannelAudienceDonut: React.FC<ChannelAudienceDonutProps> = ({ connections }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const data = connections.filter(c => (c.followerCount || 0) > 0);
  const total = data.reduce((acc, c) => acc + (c.followerCount || 0), 0);

  if (total === 0) {
    return (
      <div className="h-[168px] flex items-center justify-center text-center px-4">
        <p className="text-xs text-slate-400 font-medium">Connect a channel to see your audience breakdown here.</p>
      </div>
    );
  }

  const size = 128;
  const strokeW = 20;
  const r = (size - strokeW) / 2;
  const circumference = 2 * Math.PI * r;
  const gapPx = 3;

  let cumulative = 0;
  const segments = data.map((c) => {
    const fraction = (c.followerCount || 0) / total;
    const rawLength = fraction * circumference;
    const dash = Math.max(rawLength - gapPx, 0);
    const offset = -cumulative;
    cumulative += rawLength;
    return { id: c.id, name: c.name, color: c.color, followerCount: c.followerCount || 0, fraction, dash, offset };
  });

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Audience by channel">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeW} />
          {segments.map(seg => (
            <circle
              key={seg.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeW}
              strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
              strokeDashoffset={seg.offset}
              opacity={hovered === null || hovered === seg.id ? 1 : 0.35}
              style={{ transition: 'opacity .15s' }}
            />
          ))}
        </g>
        <text x={size / 2} y={size / 2 - 3} textAnchor="middle" fontSize="15" fontWeight={800} fill="#0f172a">
          {total >= 1000 ? `${(total / 1000).toFixed(1)}K` : total}
        </text>
        <text x={size / 2} y={size / 2 + 13} textAnchor="middle" fontSize="9" fontWeight={700} fill="#94a3b8">
          FOLLOWERS
        </text>
      </svg>

      <ul className="space-y-1.5 flex-1 min-w-0">
        {segments.map(seg => (
          <li key={seg.id}>
            <button
              type="button"
              onMouseEnter={() => setHovered(seg.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(seg.id)}
              onBlur={() => setHovered(null)}
              className="w-full flex items-center gap-2 text-left rounded-lg px-1.5 py-1 hover:bg-slate-50 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <PlatformLogo platform={seg.id} className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] font-bold text-slate-700 capitalize truncate">{seg.id}</span>
              <span className="text-[11px] font-black text-slate-900 ml-auto tabular-nums">
                {Math.round(seg.fraction * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
