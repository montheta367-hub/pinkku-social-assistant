import React, { useState, useEffect, useRef } from 'react';
import { X, Send, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';

interface TelegramConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (accountName: string) => void;
}

type Stage = 'starting' | 'waiting' | 'connected' | 'error';

export const TelegramConnectModal: React.FC<TelegramConnectModalProps> = ({ isOpen, onClose, onConnected }) => {
  const [stage, setStage] = useState<Stage>('starting');
  const [deepLink, setDeepLink] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setStage('starting');
    setError('');
    let code = '';

    const start = async () => {
      try {
        const token = localStorage.getItem('pinkku_token');
        const res = await fetch('/api/connections/telegram/start', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setStage('error');
          setError(data.error || 'Could not start the Telegram connection.');
          return;
        }
        code = data.code;
        setDeepLink(data.deepLink);
        setStage('waiting');
        window.open(data.deepLink, '_blank');

        pollRef.current = window.setInterval(async () => {
          try {
            const statusRes = await fetch('/api/connections/telegram/status', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const statusData = await statusRes.json();
            if (statusData.connected) {
              if (pollRef.current) window.clearInterval(pollRef.current);
              setStage('connected');
              onConnected(statusData.accountName);
              setTimeout(onClose, 1200);
            }
          } catch {
            // Transient network hiccup — keep polling.
          }
        }, 2000);
      } catch {
        setStage('error');
        setError('Could not reach the server to start the Telegram connection.');
      }
    };

    start();

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-2xl space-y-5 text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-400 to-sky-600 text-white shadow-lg shadow-sky-500/25">
          <Send className="w-6 h-6" />
        </div>

        {stage === 'starting' && (
          <div className="space-y-1">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Preparing connection…</h3>
            <p className="text-xs text-slate-500 font-medium">One moment.</p>
          </div>
        )}

        {stage === 'waiting' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Almost there</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                We opened Telegram in a new tab with a message ready to send. Just hit <span className="font-bold">Send</span> in that chat — this window will update automatically once you do.
              </p>
            </div>

            <a
              href={deepLink}
              target="_blank"
              rel="noreferrer"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 text-white font-extrabold text-xs shadow-md shadow-sky-500/20 hover:opacity-95 transition-all flex items-center justify-center gap-2"
            >
              <span>Open Telegram Again</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              <span>Waiting for you to message the bot…</span>
            </div>
          </div>
        )}

        {stage === 'connected' && (
          <div className="space-y-1">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Connected!</h3>
            <p className="text-xs text-slate-500 font-medium">Your Telegram account is now linked to Pinkku.</p>
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
