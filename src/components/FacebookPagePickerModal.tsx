import React, { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PlatformLogo } from './PlatformLogo';

interface FacebookPage {
  id: string;
  name: string;
  picture?: string;
}

interface FacebookPagePickerModalProps {
  token: string | null;
  onClose: () => void;
  onConnected: () => void;
}

type Stage = 'loading' | 'picking' | 'connecting' | 'connected' | 'error';

export const FacebookPagePickerModal: React.FC<FacebookPagePickerModalProps> = ({ token, onClose, onConnected }) => {
  const [stage, setStage] = useState<Stage>('loading');
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setStage('loading');
    setError('');

    const load = async () => {
      try {
        const authToken = localStorage.getItem('pinkku_token');
        const res = await fetch(`/api/oauth/facebook/pending-pages?token=${encodeURIComponent(token)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setStage('error');
          setError(data.error || 'Could not load your Facebook Pages.');
          return;
        }
        setPages(data.pages || []);
        setStage('picking');
      } catch {
        setStage('error');
        setError('Could not reach the server to load your Facebook Pages.');
      }
    };

    load();
  }, [token]);

  const handlePick = async (pageId: string) => {
    if (!token) return;
    setStage('connecting');
    try {
      const authToken = localStorage.getItem('pinkku_token');
      const res = await fetch('/api/oauth/facebook/select-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ token, pageId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setStage('error');
        setError(data.error || 'Could not connect that Page.');
        return;
      }
      setStage('connected');
      onConnected();
      setTimeout(onClose, 1200);
    } catch {
      setStage('error');
      setError('Could not reach the server to connect that Page.');
    }
  };

  if (!token) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-2xl space-y-5 text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
          <PlatformLogo platform="facebook" className="w-6 h-6" />
        </div>

        {stage === 'loading' && (
          <div className="space-y-1">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Loading your Pages…</h3>
            <p className="text-xs text-slate-500 font-medium">One moment.</p>
          </div>
        )}

        {stage === 'picking' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Choose a Facebook Page</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                You admin more than one Page. Pick the one you want to connect to Pinkku.
              </p>
            </div>

            <div className="space-y-2 text-left max-h-72 overflow-y-auto">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => handlePick(page.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                >
                  {page.picture ? (
                    <img src={page.picture} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      <PlatformLogo platform="facebook" className="w-4 h-4" />
                    </div>
                  )}
                  <span className="text-xs font-bold text-slate-800 truncate">{page.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === 'connecting' && (
          <div className="space-y-1">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Connecting…</h3>
            <p className="text-xs text-slate-500 font-medium">One moment.</p>
          </div>
        )}

        {stage === 'connected' && (
          <div className="space-y-1">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Connected!</h3>
            <p className="text-xs text-slate-500 font-medium">That Page is now linked to Pinkku.</p>
          </div>
        )}

        {stage === 'error' && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
