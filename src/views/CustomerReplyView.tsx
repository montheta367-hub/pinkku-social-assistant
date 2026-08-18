import React, { useState } from 'react';
import { CustomerMessage, UserProfile } from '../types';
import { PlatformLogo } from '../components/PlatformLogo';
import { 
  MessageSquare, 
  Sparkles, 
  Send, 
  CheckCircle2, 
  RefreshCw, 
  Check, 
  CreditCard, 
  Truck, 
  AlertCircle,
  Copy
} from 'lucide-react';

interface CustomerReplyViewProps {
  user: UserProfile;
  messages: CustomerMessage[];
  onUpdateMessage: (id: string, replyText: string) => void;
}

export const CustomerReplyView: React.FC<CustomerReplyViewProps> = ({
  user,
  messages,
  onUpdateMessage
}) => {
  const [selectedMsgId, setSelectedMsgId] = useState<string>(messages[0]?.id || "");
  const [activeReply, setActiveReply] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const selectedMsg = messages.find(m => m.id === selectedMsgId) || messages[0];

  const handleSelectMessage = (msg: CustomerMessage) => {
    setSelectedMsgId(msg.id);
    setActiveReply(msg.suggestedReplyMyanmar || "");
    setSentSuccess(false);
  };

  const handleGenerateReply = async () => {
    if (!selectedMsg) return;
    setIsGenerating(true);
    setSentSuccess(false);

    try {
      const res = await fetch("/api/ai/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerMessage: selectedMsg.message,
          customerName: selectedMsg.customerName,
          platform: selectedMsg.platform,
          businessName: user.businessName
        })
      });

      const data = await res.json();
      setActiveReply(data.suggestedReplyMyanmar || selectedMsg.suggestedReplyMyanmar || "");
    } catch (err) {
      console.error("Reply generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendReply = () => {
    if (!activeReply.trim() || !selectedMsg) return;
    onUpdateMessage(selectedMsg.id, activeReply);
    setSentSuccess(true);
    setTimeout(() => setSentSuccess(false), 2500);
  };

  const handleCopyReply = () => {
    navigator.clipboard.writeText(activeReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Customer DMs & Auto-Reply Studio
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            AI-assisted conversational agent handling Messenger, TikTok DMs & Telegram orders with Burmese politeness.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Messages List (Left Column) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
            <span className="text-xs font-black text-slate-800">Inbox ({messages.length})</span>
            <span className="text-[11px] font-bold text-slate-400">Synced across channels</span>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {messages.map((msg) => {
              const isSelected = msg.id === selectedMsg?.id;
              return (
                <button
                  key={msg.id}
                  onClick={() => handleSelectMessage(msg)}
                  className={`w-full p-3.5 rounded-2xl text-left border transition-all space-y-2 ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-400 shadow-sm'
                      : 'bg-slate-50/50 border-slate-200/70 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PlatformLogo platform={msg.platform} className="w-4 h-4" />
                      <span className="text-xs font-black text-slate-900">{msg.customerName}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {msg.status === 'unread' ? (
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                      <span className="text-[10px] font-medium text-slate-400">{msg.timestamp}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 font-medium line-clamp-2">
                    {msg.message}
                  </p>

                  {msg.orderIntent && (
                    <span className="inline-block text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      🛍️ Order / Price Inquiry
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reply Composer & AI Assistant (Right Column) */}
        {selectedMsg ? (
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5 flex flex-col justify-between">
            
            <div className="space-y-4">
              
              {/* Customer Info Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-100">
                    <PlatformLogo platform={selectedMsg.platform} className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">{selectedMsg.customerName}</h3>
                    <p className="text-[11px] text-slate-400 capitalize font-medium">via {selectedMsg.platform} • {selectedMsg.timestamp}</p>
                  </div>
                </div>

                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
                  selectedMsg.status === 'unread' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {selectedMsg.status}
                </span>
              </div>

              {/* Customer Message Bubble */}
              <div className="p-4 rounded-2xl bg-slate-100/80 text-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400">Customer said:</span>
                <p className="text-xs font-semibold leading-relaxed">
                  "{selectedMsg.message}"
                </p>
              </div>

              {/* AI Suggestion Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-black text-[#FF2D85]">
                  <Sparkles className="w-4 h-4" />
                  <span>AI Burmese Response:</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerateReply}
                    disabled={isGenerating}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-600 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>Regenerate</span>
                  </button>

                  <button
                    onClick={handleCopyReply}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-600 flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {/* Editable Reply Box */}
              <textarea
                rows={5}
                value={activeReply || selectedMsg.suggestedReplyMyanmar || ""}
                onChange={(e) => setActiveReply(e.target.value)}
                placeholder="Burmese reply will appear here..."
                className="w-full p-4 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white leading-relaxed outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Quick Template Tags */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 py-1">Templates:</span>
                <button
                  type="button"
                  onClick={() => setActiveReply("မင်္ဂလာပါရှင်။ ပစ္စည်း ready stock ရှိပါသေးတယ်ရှင်။ KPay / WavePay ဖြင့် အဆင်ပြေစွာ ပေးချေနိုင်ပါသည်။")}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700"
                >
                  ✓ Ready Stock + KPay
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReply("မင်္ဂလာပါရှင်။ ရန်ကုန်မြို့တွင်း (၁-၂) ရက်အတွင်း အိမ်အရောက်ပို့ဆောင်ပေးပါတယ်ရှင်။ လိပ်စာလေး ပေးပို့ပေးပါနော်။")}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700"
                >
                  🚚 Delivery Info
                </button>
              </div>

            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              {sentSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>✓ Reply sent directly to {selectedMsg.customerName} via {selectedMsg.platform}!</span>
                </div>
              )}

              <button
                onClick={handleSendReply}
                disabled={!activeReply.trim()}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold text-xs shadow-md shadow-blue-500/20 hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
                <span>Send Reply to Customer</span>
              </button>
            </div>

          </div>
        ) : (
          <div className="lg:col-span-7 bg-white rounded-3xl p-12 border border-slate-200/80 text-center text-slate-400">
            Select a customer message from the left to draft a reply.
          </div>
        )}

      </div>

    </div>
  );
};
