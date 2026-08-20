import React from 'react';
import { PlatformLogo } from './PlatformLogo';
import pinkkuIcon from '../assets/pinkku-icon.png';

interface PinkkuWebDiagramProps {
  variant?: 'hero' | 'mini';
  className?: string;
}

// Pentagon node positions around center (300,300), radius 210
const NODES: { id: string; label: string; x: number; y: number }[] = [
  { id: 'facebook', label: 'Facebook', x: 300, y: 90 },
  { id: 'instagram', label: 'Instagram', x: 500, y: 235 },
  { id: 'tiktok', label: 'TikTok', x: 424, y: 470 },
  { id: 'telegram', label: 'Telegram', x: 176, y: 470 },
  { id: 'gmail', label: 'Gmail', x: 100, y: 235 },
];

// Shorter, dashed "room to grow" spokes in the gaps between platform nodes —
// signals more integrations are coming, not a hard limit of 5.
const MORE_SPOKES: { x: number; y: number }[] = [
  { x: 388, y: 179 },
  { x: 157, y: 346 },
];

const ringPoints = (scale: number) =>
  NODES.map((n) => {
    const x = 300 + (n.x - 300) * scale;
    const y = 300 + (n.y - 300) * scale;
    return `${x},${y}`;
  }).join(' ');

export const PinkkuWebDiagram: React.FC<PinkkuWebDiagramProps> = ({ variant = 'hero', className = '' }) => {
  const showLabels = variant === 'hero';

  return (
    <svg viewBox="0 0 600 560" className={className} style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="pinkkuBgGrad" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="#FFE4EF" />
          <stop offset="100%" stopColor="#FFF7FA" />
        </radialGradient>
      </defs>

      {/* soft pink backdrop instead of harsh white */}
      <rect x={-20} y={-20} width={640} height={600} rx={28} fill="url(#pinkkuBgGrad)" />

      {/* faint web rings */}
      <polygon points={ringPoints(1)} fill="none" stroke="#FBCFE8" strokeWidth={1.2} opacity={0.7} />
      <polygon points={ringPoints(0.68)} fill="none" stroke="#FBCFE8" strokeWidth={1} opacity={0.55} />
      <polygon points={ringPoints(0.36)} fill="none" stroke="#FBCFE8" strokeWidth={1} opacity={0.4} />

      {/* spokes */}
      {NODES.map((n) => (
        <line key={`spoke-${n.id}`} x1={300} y1={300} x2={n.x} y2={n.y} stroke="#FCA5C7" strokeWidth={1.3} opacity={0.55} />
      ))}

      {/* extra dashed "room to grow" legs — Pinkku isn't limited to 5 apps */}
      {MORE_SPOKES.map((s, i) => (
        <g key={`more-${i}`} opacity={0.6}>
          <line x1={300} y1={300} x2={s.x} y2={s.y} stroke="#FCA5C7" strokeWidth={1.3} strokeDasharray="4 4" />
          <circle cx={s.x} cy={s.y} r={13} fill="#ffffff" stroke="#F1D9E4" strokeWidth={1.5} strokeDasharray="3 3" />
          <text x={s.x} y={s.y + 4} textAnchor="middle" fontSize={13} fontWeight={800} fill="#FCA5C7">+</text>
        </g>
      ))}

      {/* traveling pulses */}
      {NODES.map((n, i) => (
        <circle key={`pulse-${n.id}`} r={3.2} fill="#FF2D85">
          <animateMotion
            dur={`${2.6 + i * 0.3}s`}
            begin={`${i * 0.35}s`}
            repeatCount="indefinite"
            path={`M${n.x},${n.y} L300,300`}
          />
        </circle>
      ))}

      {/* center hub — the real Pinkku spider */}
      <g style={{ transformOrigin: '300px 300px' }} className="pinkku-hub-breathe">
        <circle cx={300} cy={300} r={58} fill="#FF2D85" opacity={0.12} />
        <circle cx={300} cy={300} r={46} fill="#ffffff" />
        <foreignObject x={262} y={262} width={76} height={76}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', overflow: 'hidden' }}>
            <img src={pinkkuIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </foreignObject>
      </g>
      {showLabels && (
        <text x={300} y={352} textAnchor="middle" fontFamily="inherit" fontWeight={800} fontSize={13} fill="#831843">
          PINKKU
        </text>
      )}

      {/* platform nodes */}
      {NODES.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={30} fill="#ffffff" stroke="#F1D9E4" strokeWidth={1.5} />
          <foreignObject x={n.x - 13} y={n.y - 13} width={26} height={26}>
            <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlatformLogo platform={n.id} className="w-6 h-6" />
            </div>
          </foreignObject>
          {showLabels && (
            <text
              x={n.x}
              y={n.y + (n.y < 300 ? -42 : 52)}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill="#64748b"
            >
              {n.label}
            </text>
          )}
        </g>
      ))}

      <style>{`
        .pinkku-hub-breathe {
          animation: pinkkuBreathe 3.2s ease-in-out infinite;
        }
        @keyframes pinkkuBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </svg>
  );
};
