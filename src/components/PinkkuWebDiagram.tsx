import React from 'react';
import { PlatformLogo } from './PlatformLogo';

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
        <radialGradient id="pinkkuCenterGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF6FA8" />
          <stop offset="100%" stopColor="#E11D62" />
        </radialGradient>
      </defs>

      {/* faint web rings */}
      <polygon points={ringPoints(1)} fill="none" stroke="#FBCFE8" strokeWidth={1.2} opacity={0.7} />
      <polygon points={ringPoints(0.68)} fill="none" stroke="#FBCFE8" strokeWidth={1} opacity={0.55} />
      <polygon points={ringPoints(0.36)} fill="none" stroke="#FBCFE8" strokeWidth={1} opacity={0.4} />

      {/* spokes */}
      {NODES.map((n) => (
        <line key={`spoke-${n.id}`} x1={300} y1={300} x2={n.x} y2={n.y} stroke="#FCA5C7" strokeWidth={1.3} opacity={0.55} />
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

      {/* center hub */}
      <g style={{ transformOrigin: '300px 300px' }} className="pinkku-hub-breathe">
        <circle cx={300} cy={300} r={54} fill="#FF2D85" opacity={0.1} />
        <circle cx={300} cy={300} r={38} fill="url(#pinkkuCenterGrad)" />
        <g stroke="#fff" strokeWidth={1.4} opacity={0.9}>
          <line x1={300} y1={300} x2={300} y2={282} />
          <line x1={300} y1={300} x2={315} y2={293} />
          <line x1={300} y1={300} x2={310} y2={311} />
          <line x1={300} y1={300} x2={290} y2={311} />
          <line x1={300} y1={300} x2={285} y2={293} />
        </g>
        <circle cx={300} cy={300} r={6.5} fill="#fff" />
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
