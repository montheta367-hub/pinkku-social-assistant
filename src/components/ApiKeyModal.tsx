import React, { useEffect, useState } from 'react';
import { X, Key, Check, ShieldAlert, Trash2 } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveKey: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSaveKey }) => {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingPreview, setExistingPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setApiKey("");
    setError("");
    const token = localStorage.getItem('pinkku_token');
    if (!token) return;
    fetch('/api/settings/gemini-key', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => setExistingPreview(data?.hasKey ? data.preview : null))
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const saveKey = async (value: string | null) => {
    setError("");
    setSaving(true);
    const token = localStorage.getItem('pinkku_token');
    try {
      const res = await fetch('/api/settings/gemini-key', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save this key.');
        return;
      }
      setExistingPreview(data.hasKey ? data.preview : null);
      onSaveKey(value || "");
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1000);
    } catch {
      setError('Could not save this key.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) saveKey(apiKey.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-slate-100 shadow-2xl space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">Custom Gemini API Key</h3>
            <p className="text-xs text-slate-500 font-medium">Use your own Google AI key — every AI feature on your account runs on your own quota instead of Pinkku's shared one.</p>
          </div>
        </div>

        {existingPreview && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-[11px] font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>A key is saved ({existingPreview}). Enter a new one below to replace it.</span>
          </div>
        )}

        {saved && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Saved!</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-bold">{error}</div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Google Gemini API Key (AI Studio)</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-mono text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-[10px] text-slate-400 font-medium mt-1">Get a free key at aistudio.google.com/apikey</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Stored encrypted on Pinkku's server</span>
            </div>
            <p>Used for every AI feature on your account (posts, customer replies, TikTok tips, Gmail triage) instead of Pinkku's shared key.</p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
            >
              Cancel
            </button>
            {existingPreview && (
              <button
                type="button"
                disabled={saving}
                onClick={() => saveKey(null)}
                className="py-2.5 px-3 rounded-xl border border-rose-200 text-rose-600 font-bold text-xs hover:bg-rose-50 flex items-center gap-1.5 disabled:opacity-50"
                title="Remove key — go back to Pinkku's shared quota"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              disabled={saving || !apiKey.trim()}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-md shadow-amber-500/20 transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
