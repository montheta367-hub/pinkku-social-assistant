import React, { useRef, useState } from 'react';
import { UserProfile, PlatformType, SocialPost, PlatformConnection } from '../types';
import { PlatformLogo } from '../components/PlatformLogo';
import { Copy, Check, RefreshCw, Wand2, FileText, ClipboardCheck, Plus, AlertTriangle, Image as ImageIcon, Link as LinkIcon, Hash, MoreHorizontal, X } from 'lucide-react';

// Real per-platform caption limits, used to warn when the shared generated
// text would get cut off or rejected on a given platform.
const PLATFORM_CHAR_LIMITS: Record<PlatformType, number> = {
  facebook: 63206,
  instagram: 2200,
  tiktok: 2200,
  telegram: 4096,
  gmail: 100000,
};

interface ContentCreatorViewProps {
  user: UserProfile;
  onSavePost: (post: Omit<SocialPost, 'id' | 'createdAt'>) => void;
  connections: PlatformConnection[];
  onOpenConnectAccounts: () => void;
}

export const ContentCreatorView: React.FC<ContentCreatorViewProps> = ({ user, onSavePost, connections, onOpenConnectAccounts }) => {
  const connectedCount = connections.filter(c => c.connected).length;
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Excited & Promotional");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformType[]>(['facebook', 'instagram', 'tiktok', 'telegram']);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [myanmarText, setMyanmarText] = useState("");
  const [englishText, setEnglishText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  
  const [copied, setCopied] = useState(false);
  const [savedAs, setSavedAs] = useState<'draft' | 'pending_review' | null>(null);

  // One shared image for the whole post (every platform card shows the same
  // attachment) — stays local to this session for now since the posts table
  // has no media column yet, so it won't survive a reload once saved.
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<PlatformType | null>(null);

  const handlePickMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMediaPreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddLink = () => {
    const url = window.prompt('Paste a link to add to the caption:');
    if (url && url.trim()) setMyanmarText((prev) => `${prev}${prev ? '\n' : ''}${url.trim()}`);
  };

  const handleAddTag = () => {
    const raw = window.prompt('Add a hashtag:');
    if (!raw || !raw.trim()) return;
    const tag = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
  };

  const togglePlatform = (p: PlatformType) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter(x => x !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim() && !mediaPreview) return;
    setIsGenerating(true);
    setSavedAs(null);

    try {
      const token = localStorage.getItem('pinkku_token');
      const res = await fetch("/api/ai/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          topic: topic.trim(),
          tone,
          platforms: selectedPlatforms,
          businessType: user.businessType,
          language: "myanmar",
          imageBase64: mediaPreview || undefined
        })
      });

      const data = await res.json();
      setGeneratedTitle(data.title || `Promotion: ${topic}`);
      setMyanmarText(data.myanmarContent || "");
      setEnglishText(data.content || "");
      setTags(data.tags || ['#PinkkuMM', '#OnlineShopMM', '#Yangon']);
    } catch (err) {
      console.error("AI Generation error:", err);
      // Fallback
      setGeneratedTitle(`✨ ${topic} - အထူးအရောင်းမြှင့်တင်ရေး`);
      setMyanmarText(`မင်္ဂလာပါရှင်။ ချစ်ရတဲ့ customer တို့အတွက် ${topic} ပစ္စည်းလေးတွေကို အထူးစျေးနှုန်းဖြင့် ဝယ်ယူရရှိနိုင်ပါပြီရှင်။ အိမ်အရောက်ပို့ဆောင်ပေးပြီး KPay / WavePay ဖြင့် အဆင်ပြေစွာ ငွေပေးချေနိုင်ပါသည်။ 💖`);
      setEnglishText(`Exciting news! ${topic} is now available with special discount & fast nationwide delivery.`);
      setTags(['#PinkkuBeauty', '#MyanmarOnlineShop', '#Promotion']);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    const textToCopy = `${generatedTitle}\n\n${myanmarText}\n\n${englishText}\n\n${tags.join(" ")}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = (status: 'draft' | 'pending_review') => {
    if (!myanmarText && !englishText) return;

    onSavePost({
      title: generatedTitle || topic || 'New Social Post',
      content: englishText,
      myanmarContent: myanmarText,
      platforms: selectedPlatforms,
      status,
      tone,
      tags,
      mediaUrl: mediaPreview || undefined,
    });
    setSavedAs(status);
    setTimeout(() => setSavedAs(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">✍️</span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Smart Publish
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Auto-generate culturally resonant social posts in Myanmar Unicode with viral hooks & call-to-actions.
          </p>
        </div>

        <button
          onClick={onOpenConnectAccounts}
          className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Connect accounts</span>
          {connectedCount > 0 && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white/15">
              {connectedCount}
            </span>
          )}
        </button>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5 flex flex-col">

          {/* Product photo — attach this first and AI will write the caption
              straight from what's in the photo, no topic text required. */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Product Photo <span className="font-medium text-slate-400 normal-case">(optional — attach it and skip typing a topic below)</span>
            </label>
            {mediaPreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 w-40">
                <img src={mediaPreview} alt="Attached product" className="w-full h-40 object-cover" />
                <button
                  type="button"
                  onClick={() => setMediaPreview(null)}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-40 h-40 rounded-2xl border-2 border-dashed border-slate-200 hover:border-pink-300 hover:bg-pink-50/30 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:text-[#FF2D85] transition-colors"
              >
                <ImageIcon className="w-6 h-6" />
                <span className="text-[11px] font-bold">Add product photo</span>
              </button>
            )}
          </div>

          {/* Topic, tone, platforms & generate — all feed the single card stack below */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Product, Offer or Promotion Topic <span className="font-medium text-slate-400 normal-case">{mediaPreview ? '(optional — AI will describe the photo above)' : ''}</span>
            </label>
            <textarea
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={mediaPreview ? "Optional — add price, promo or delivery details the photo doesn't show..." : "e.g. 50% discount on Korean Whitening Cream for Thadingyut festival, free delivery in Yangon..."}
              className="w-full p-3.5 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Tone Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Tone of Voice</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
              >
                <option value="Excited & Promotional">🎉 Excited & Promotional (ရောင်းအားတက်စေမည့် စတိုင်)</option>
                <option value="Polite & Friendly">🌸 Polite & Friendly (ယဉ်ကျေးနွေးထွေးသော စတိုင်)</option>
                <option value="Educational & Tips">💡 Educational & Tips (ဗဟုသုတမျှဝေမှု စတိုင်)</option>
                <option value="Urgent & Flash Sale">⚡ Urgent & Flash Sale (အချိန်အကန့်အသတ် အထူးပရိုမိုးရှင်း)</option>
                <option value="Luxury & Exclusive">💎 Luxury & Exclusive (ခေတ်မီ အဆင့်မြင့် စတိုင်)</option>
              </select>
            </div>

            {/* Target Platforms */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Publish To Platforms</label>
              <div className="grid grid-cols-2 gap-2">
                {(['facebook', 'instagram', 'tiktok', 'telegram'] as PlatformType[]).map((p) => {
                  const isChecked = selectedPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2.5 transition-all ${
                        isChecked
                          ? 'border-pink-500 bg-pink-50 text-[#FF2D85]'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <PlatformLogo platform={p} className="w-4 h-4" />
                      <span className="capitalize">{p}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || (!topic.trim() && !mediaPreview)}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-lg shadow-pink-500/25 hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Generating Burmese Copy with Gemini...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>Generate Social Post with AI</span>
              </>
            )}
          </button>

          {/* Quick Idea Presets */}
          <div className="pb-2 border-b border-slate-100 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Quick Topic Ideas:</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                "New Skincare Arrivals",
                "Buy 1 Get 1 Free Promo",
                "Weekend Flash Sale 20% Off",
                "Customer Review & Feedback"
              ].map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setTopic(idea)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-pink-100 hover:text-[#FF2D85] text-[11px] font-semibold text-slate-600 transition-colors"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>

          {/* Generated Post header */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <span className="text-xs font-black text-slate-800">Generated Post</span>
            <button
              onClick={handleCopy}
              disabled={!myanmarText}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied!" : "Copy Post"}</span>
            </button>
          </div>

          {/* Editable Title */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Headline</label>
            <input
              type="text"
              value={generatedTitle}
              onChange={(e) => setGeneratedTitle(e.target.value)}
              placeholder="Post title with emoji..."
              className="w-full p-2.5 rounded-xl border border-slate-200 font-bold text-xs text-slate-900 bg-slate-50 focus:bg-white"
            />
          </div>

          {/* English Content (secondary, since Myanmar is the primary bilingual caption) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">English Translation</label>
            <textarea
              rows={2}
              value={englishText}
              onChange={(e) => setEnglishText(e.target.value)}
              placeholder="English description..."
              className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-slate-50 focus:bg-white leading-relaxed"
            />
          </div>

          {/* Per-Platform Cards — all share the one Myanmar caption below (this
              app saves a single caption per post across its platforms, not an
              independent one per platform), so editing any card's textarea
              updates every other card too; that's intentional, not a bug. */}
          <div className="space-y-3">
            <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handlePickMedia} className="hidden" />
            {(myanmarText || englishText) && (
              <p className="text-[10px] text-slate-400 font-medium -mb-1.5">
                Editing a caption below updates it for every selected channel. The photo/video you attach is shared across all channels too.
              </p>
            )}
            {selectedPlatforms.map((p) => {
              const conn = connections.find((c) => c.id === p);
              const limit = PLATFORM_CHAR_LIMITS[p];
              const overLimit = myanmarText.length > limit;

              return (
                <div key={p} className="rounded-2xl border border-slate-200/80 p-4 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                        <PlatformLogo platform={p} className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 capitalize">{p}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate">
                          {conn?.connected ? (conn.accountName || conn.handle || 'Connected') : 'Not connected'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold ${overLimit ? 'text-rose-600' : 'text-slate-400'}`}>
                        {myanmarText.length}/{limit.toLocaleString()}
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuOpenFor(menuOpenFor === p ? null : p)}
                          className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuOpenFor === p && (
                          <div className="absolute right-0 top-7 z-10 w-40 bg-white rounded-xl border border-slate-200 shadow-lg py-1">
                            <button
                              type="button"
                              onClick={() => { togglePlatform(p); setMenuOpenFor(null); }}
                              className="w-full text-left px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
                            >
                              Remove channel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <textarea
                    rows={3}
                    value={myanmarText}
                    onChange={(e) => setMyanmarText(e.target.value)}
                    placeholder="Burmese caption will appear here..."
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white leading-relaxed"
                  />

                  <div className="flex items-center gap-4 text-[11px] font-bold text-slate-500">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 hover:text-slate-800">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Media</span>
                    </button>
                    <button type="button" onClick={handleAddLink} className="flex items-center gap-1.5 hover:text-slate-800">
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>Link</span>
                    </button>
                    <button type="button" onClick={handleAddTag} className="flex items-center gap-1.5 hover:text-slate-800">
                      <Hash className="w-3.5 h-3.5" />
                      <span>Tag</span>
                    </button>
                  </div>

                  {mediaPreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200">
                      <img src={mediaPreview} alt="Attached media" className="w-full max-h-56 object-cover" />
                      <button
                        type="button"
                        onClick={() => setMediaPreview(null)}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-8 rounded-xl border-2 border-dashed border-slate-200 hover:border-pink-300 hover:bg-pink-50/30 flex flex-col items-center gap-1.5 text-slate-400 hover:text-[#FF2D85] transition-colors"
                    >
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-[11px] font-bold">Add photo or video</span>
                    </button>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-pink-50 text-[#FF2D85] text-xs font-bold">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {!conn?.connected && (
                      <button
                        type="button"
                        onClick={onOpenConnectAccounts}
                        className="text-[10px] font-bold text-[#FF2D85] hover:underline shrink-0"
                      >
                        Connect {p} →
                      </button>
                    )}
                  </div>

                  {overLimit && (
                    <p className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>Too long for {p} — trim the caption above.</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Save Actions */}
          <div className="mt-auto pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  selectedPlatforms.every((p) => connections.find((c) => c.id === p)?.connected)
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {selectedPlatforms.filter((p) => connections.find((c) => c.id === p)?.connected).length}/{selectedPlatforms.length} channels ready
                </span>
                <p className="text-[10px] text-slate-400 font-medium mt-1">
                  {selectedPlatforms.every((p) => connections.find((c) => c.id === p)?.connected)
                    ? 'All selected channels are connected.'
                    : 'Connect the remaining channels above before you submit.'}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSave('draft')}
                  disabled={!myanmarText && !englishText}
                  className="py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold text-xs shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <FileText className="w-4 h-4" />
                  <span>Save as Draft</span>
                </button>
                <button
                  onClick={() => handleSave('pending_review')}
                  disabled={!myanmarText && !englishText}
                  className="py-3 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>Submit for Review</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-medium">
              AI-generated content always needs a human check before it goes out — save as a draft to keep editing, or submit it for review to approve and schedule it.
            </p>

            {savedAs && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{savedAs === 'draft' ? '✓ Saved as draft.' : '✓ Submitted for review — find it in the Social Calendar to approve & schedule.'}</span>
              </div>
            )}
          </div>

      </div>

    </div>
  );
};
