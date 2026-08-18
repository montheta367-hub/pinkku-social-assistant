import React from 'react';
import { PlatformConnection } from '../types';
import { PlatformLogo } from './PlatformLogo';
import { CheckCircle2, RefreshCw, Plus, Settings2 } from 'lucide-react';

interface SpiderConnectionHubProps {
  connections: PlatformConnection[];
  onToggleConnect: (id: string) => void;
  onRefreshAll: () => void;
  /** Platform ids that have their own dedicated management page inside Pinkku
   *  (e.g. Gmail's inbox, TikTok's management page) — clicking their button
   *  opens that page instead of disconnecting. */
  managedPlatforms?: string[];
  onManage?: (id: string) => void;
}

export const SpiderConnectionHub: React.FC<SpiderConnectionHubProps> = ({
  connections,
  onToggleConnect,
  onRefreshAll,
  managedPlatforms = [],
  onManage
}) => {
  return (
    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🕷️</span>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Cross-Channel Spider Connection Hub
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Centralized hub orchestrating your Facebook, TikTok, Instagram, Telegram & Google Business data
          </p>
        </div>

        <button
          onClick={onRefreshAll}
          className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Sync All 5 Channels</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {connections.map((conn) => {
          const hasManagementPage = conn.connected && managedPlatforms.includes(conn.id) && !!onManage;
          return (
            <div
              key={conn.id}
              className={`rounded-2xl p-4 border transition-all relative flex flex-col justify-between space-y-3 ${
                conn.connected
                  ? 'bg-slate-50/70 border-slate-200 hover:border-pink-300'
                  : 'bg-white border-dashed border-slate-300 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center">
                    <PlatformLogo platform={conn.id} className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-900">{conn.name}</h3>
                    <p className="text-[11px] text-slate-500 font-medium truncate max-w-[130px]">
                      {conn.connected ? (conn.accountName || 'Connected') : 'Not connected yet'}
                    </p>
                  </div>
                </div>

                {conn.connected ? (
                  <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Live</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    Disconnected
                  </span>
                )}
              </div>

              {conn.connected && (
                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">
                    {conn.followerCount ? `${conn.followerCount.toLocaleString()} followers` : 'Sync active'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">
                    {conn.lastSynced}
                  </span>
                </div>
              )}

              <button
                onClick={() => (hasManagementPage ? onManage!(conn.id) : onToggleConnect(conn.id))}
                className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  conn.connected
                    ? 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700'
                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                }`}
              >
                {conn.connected ? (
                  hasManagementPage ? (
                    <>
                      <Settings2 className="w-3.5 h-3.5" />
                      <span>Manage in Pinkku</span>
                    </>
                  ) : (
                    <span>Manage Channel</span>
                  )
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Connect Channel</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
