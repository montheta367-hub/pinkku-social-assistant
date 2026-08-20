import React, { useState } from 'react';
import { UserProfile, PlatformType, SocialPost } from '../types';
import { PlatformLogo } from '../components/PlatformLogo';
import { Sparkles, Send, Copy, Check, RefreshCw, Wand2, Tag, FileText, ClipboardCheck } from 'lucide-react';

interface ContentCreatorViewProps {
  user: UserProfile;
  onSavePost: (post: Omit<SocialPost, 'id' | 'createdAt'>) => void;
}

export const ContentCreatorView: React.FC<ContentCreatorViewProps> = ({ user, onSavePost }) => {
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
    if (!topic.trim()) return;
    setIsGenerating(true);
    setSavedAs(null);

    try {
      const res = await fetch("/api/ai/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          tone,
          platforms: selectedPlatforms,
          businessType: user.businessType,
          language: "myanmar"
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
    });
    setSavedAs(status);
    setTimeout(() => setSavedAs(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">✍️</span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Burmese & English AI Content Studio
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Auto-generate culturally resonant social posts in Myanmar Unicode with viral hooks & call-to-actions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Form: Topic & Options */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
          
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Product, Offer or Promotion Topic
            </label>
            <textarea
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. 50% discount on Korean Whitening Cream for Thadingyut festival, free delivery in Yangon..."
              className="w-full p-3.5 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>

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
            <label className="block text-xs font-bold text-slate-700 mb-2">Publish To Platforms</label>
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

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim()}
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
          <div className="pt-2 border-t border-slate-100 space-y-2">
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

        </div>

        {/* Right Output & Preview */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5 flex flex-col justify-between">
          
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-800">Generated Post Preview</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  Needs Your Review
                </span>
              </div>

              <button
                onClick={handleCopy}
                disabled={!myanmarText}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
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

            {/* Myanmar Content */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Myanmar Content (မြန်မာဘာသာစာသား)
              </label>
              <textarea
                rows={5}
                value={myanmarText}
                onChange={(e) => setMyanmarText(e.target.value)}
                placeholder="Burmese caption will appear here..."
                className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white leading-relaxed"
              />
            </div>

            {/* English Content */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">English Translation</label>
              <textarea
                rows={3}
                value={englishText}
                onChange={(e) => setEnglishText(e.target.value)}
                placeholder="English description..."
                className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-slate-50 focus:bg-white leading-relaxed"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                <span>Recommended Hashtags</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag, idx) => (
                  <span key={idx} className="px-2.5 py-1 rounded-lg bg-pink-50 text-[#FF2D85] text-xs font-bold">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Save Actions */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <p className="text-[11px] text-slate-400 font-medium">
              AI-generated content always needs a human check before it goes out — save as a draft to keep editing, or submit it for review to approve and schedule it.
            </p>

            {savedAs && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{savedAs === 'draft' ? '✓ Saved as draft.' : '✓ Submitted for review — find it in the Social Calendar to approve & schedule.'}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => handleSave('draft')}
                disabled={!myanmarText && !englishText}
                className="w-full py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold text-xs shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <FileText className="w-4 h-4" />
                <span>Save as Draft</span>
              </button>
              <button
                onClick={() => handleSave('pending_review')}
                disabled={!myanmarText && !englishText}
                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Submit for Review</span>
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
