import React from 'react';
import { AgentStatus } from '../types';
import { Camera, Activity, FileText, CheckCircle2, Loader2 } from 'lucide-react';

interface AgentPipelineProps {
  status: AgentStatus;
}

const PipelineStep = ({ 
  active, 
  completed, 
  icon: Icon, 
  label, 
  subtext 
}: { 
  active: boolean; 
  completed: boolean; 
  icon: React.ElementType; 
  label: string; 
  subtext: string; 
}) => {
  return (
    <div className={`flex flex-col items-center p-4 rounded-xl border transition-all duration-500 ${
      active 
        ? 'border-cyan-500 bg-cyan-950/30 shadow-[0_0_15px_rgba(6,182,212,0.3)] scale-105' 
        : completed 
          ? 'border-green-500/50 bg-green-950/20 text-green-400' 
          : 'border-slate-700 bg-slate-800/50 text-slate-500'
    }`}>
      <div className={`mb-3 p-3 rounded-full ${
        active ? 'bg-cyan-500 text-black animate-pulse' : completed ? 'bg-green-500 text-black' : 'bg-slate-700'
      }`}>
        {active ? <Loader2 className="w-6 h-6 animate-spin" /> : completed ? <CheckCircle2 className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
      </div>
      <h3 className={`font-bold text-sm mb-1 ${active ? 'text-cyan-400' : ''}`}>{label}</h3>
      <p className="text-xs opacity-70 text-center max-w-[120px]">{subtext}</p>
    </div>
  );
};

export const AgentPipeline: React.FC<AgentPipelineProps> = ({ status }) => {
  const isVision = status === AgentStatus.VISION_SCANNING;
  const isAnalysis = status === AgentStatus.DATA_ANALYSIS;
  const isReport = status === AgentStatus.REPORT_GENERATION;
  const isComplete = status === AgentStatus.COMPLETE;

  const visionDone = isAnalysis || isReport || isComplete;
  const analysisDone = isReport || isComplete;
  const reportDone = isComplete;

  return (
    <div className="w-full py-8">
      <div className="flex flex-col md:flex-row justify-center items-center gap-4 md:gap-8 relative">
        {/* Connecting Lines (Desktop) */}
        <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -z-10" />
        
        <PipelineStep 
          active={isVision} 
          completed={visionDone} 
          icon={Camera} 
          label="Agent 1: Vision" 
          subtext="Object detection & classification" 
        />
        
        <PipelineStep 
          active={isAnalysis} 
          completed={analysisDone} 
          icon={Activity} 
          label="Agent 2: Analysis" 
          subtext="Congestion & risk calculation" 
        />
        
        <PipelineStep 
          active={isReport} 
          completed={reportDone} 
          icon={FileText} 
          label="Agent 3: Reporting" 
          subtext="Summary & strategic output" 
        />
      </div>
    </div>
  );
};
