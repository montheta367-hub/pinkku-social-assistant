import React from 'react';
import { AIAgent } from '../types';
import { Bot, Sparkles, CheckCircle2, ShieldCheck, Zap, ArrowUpRight } from 'lucide-react';

interface AIAgentsViewProps {
  agents: AIAgent[];
}

export const AIAgentsView: React.FC<AIAgentsViewProps> = ({ agents }) => {
  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-[#FF2D85]" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Autonomous AI Crew for Myanmar Sellers
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Specialized multi-agent architecture running 24/7 in the background across your social & messaging channels.
          </p>
        </div>

        <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-3.5 py-1.5 rounded-full flex items-center gap-1.5 self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span>4 Agents Operating Live</span>
        </span>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {agents.map((agent) => {
          return (
            <div
              key={agent.id}
              className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4 hover:border-pink-300 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-100 to-rose-100 border border-pink-200 flex items-center justify-center text-2xl shadow-sm">
                      {agent.avatar}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">{agent.name}</h3>
                      <p className="text-xs font-bold text-[#FF2D85]">{agent.role}</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{agent.status}</span>
                  </span>
                </div>

                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  {agent.description}
                </p>

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-700 space-y-1">
                  <span className="font-bold text-slate-900 block">Core Specialty:</span>
                  <p className="font-medium text-slate-600">{agent.specialty}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Tasks Completed: </span>
                  <span className="font-black text-slate-800">{agent.tasksCompleted}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Burmese Accuracy: </span>
                  <span className="font-black text-emerald-600">{agent.accuracy}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
