import React, { useState } from 'react';
import { FullAnalysisResult, DetectionItem, TrafficLight, HistoryItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { AlertTriangle, ShieldCheck, Car, Users, TrendingUp, Zap, MapPin, Clock, History, LayoutDashboard, Ban, Activity, ScanEye, ArrowRight, ExternalLink, ArrowDown, ArrowUp } from 'lucide-react';

interface ResultsDashboardProps {
  data: FullAnalysisResult | null;
  history: HistoryItem[];
  videoSessionData: FullAnalysisResult[];
  onLoadHistoryItem: (item: HistoryItem) => void;
}

const CustomSparklineTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-brand-panel border border-white/10 px-2 py-1 rounded text-[10px] shadow-xl">
        <span className="text-brand-sky font-mono">{payload[0].value} km/h</span>
      </div>
    );
  }
  return null;
};

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ data, history, videoSessionData, onLoadHistoryItem }) => {
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');

  const effectiveTab = !data && history.length > 0 ? 'history' : activeTab;

  if (effectiveTab === 'history') {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between mb-4">
           <h3 className="text-xl font-bold text-brand-dark flex items-center gap-2">
             <History className="w-5 h-5 text-brand-indigo" />
             Analysis Database
           </h3>
           {data && <button onClick={() => setActiveTab('live')} className="text-sm text-slate-600 hover:text-brand-dark font-medium">Back to Live</button>}
        </div>
        
        <div className="bg-brand-panel rounded-xl border border-white/10 overflow-hidden shadow-xl">
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left text-slate-400">
               <thead className="text-xs text-brand-cream/70 uppercase bg-black/20">
                 <tr>
                   <th className="px-4 py-3">Time</th>
                   <th className="px-4 py-3">Context</th>
                   <th className="px-4 py-3">Traffic</th>
                   <th className="px-4 py-3">Congestion</th>
                   <th className="px-4 py-3">Violations</th>
                   <th className="px-4 py-3 text-right">Action</th>
                 </tr>
               </thead>
               <tbody>
                 {history.map((item) => (
                   <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                     <td className="px-4 py-3 font-mono text-white">{new Date(item.timestamp).toLocaleTimeString()}</td>
                     <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                           <img src={item.thumbnail} alt="thumb" className="w-10 h-6 object-cover rounded border border-white/10" />
                           <span className="text-xs truncate max-w-[150px]">{item.locationContext?.address || item.analysis.sceneType || 'Unknown'}</span>
                        </div>
                     </td>
                     <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Car className="w-3 h-3 text-brand-sky" /> {item.analysis.totalVehicles}
                            <Users className="w-3 h-3 ml-1 text-brand-indigo" /> {item.analysis.pedestrianCount}
                        </div>
                     </td>
                     <td className="px-4 py-3">
                       <span className={`px-2 py-1 rounded text-xs ${item.analysis.congestionLevel > 70 ? 'bg-brand-red/20 text-brand-red' : 'bg-green-500/20 text-green-400'}`}>
                         {item.analysis.congestionLevel}%
                       </span>
                     </td>
                     <td className="px-4 py-3">
                       {item.analysis.detectedViolations.length > 0 ? (
                         <span className="text-brand-red flex items-center gap-1"><Ban className="w-3 h-3" /> {item.analysis.detectedViolations.length}</span>
                       ) : (
                         <span className="text-slate-600">-</span>
                       )}
                     </td>
                     <td className="px-4 py-3 text-right">
                        <button 
                          onClick={() => onLoadHistoryItem(item)}
                          className="px-3 py-1 bg-brand-sky/10 text-brand-sky hover:bg-brand-sky hover:text-brand-dark rounded text-xs font-medium border border-brand-sky/20 flex items-center gap-1 ml-auto transition-all"
                        >
                            <ExternalLink className="w-3 h-3" /> Open
                        </button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { detections, analysis, report, locationContext } = data;
  
  const vehicleDetections = detections.filter(d => d.type === 'vehicle');
  const groupedChartData = vehicleDetections.reduce((acc: any[], curr) => {
      const existing = acc.find(item => item.name === curr.object);
      if (existing) {
          existing.count += curr.count;
      } else {
          acc.push({ name: curr.object, count: curr.count });
      }
      return acc;
  }, []);
  
  const congestionColor = analysis.congestionLevel > 75 ? '#FF6B6B' : analysis.congestionLevel > 40 ? '#F59E0B' : '#7DD3FC';
  
  const trackedItems = detections.filter(d => d.trackId !== undefined);

  const videoTrendData = videoSessionData.map((d, idx) => ({
    time: idx + 's',
    vehicles: d.analysis.totalVehicles,
    congestion: d.analysis.congestionLevel
  }));

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Navigation */}
      <div className="flex items-center gap-4 border-b border-brand-dark/10 pb-1">
        <button 
          onClick={() => setActiveTab('live')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'live' ? 'border-brand-indigo text-brand-indigo font-bold' : 'border-transparent text-slate-500 hover:text-brand-dark'}`}
        >
          <LayoutDashboard className="w-4 h-4" /> Live Analysis
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'border-brand-indigo text-brand-indigo font-bold' : 'border-transparent text-slate-500 hover:text-brand-dark'}`}
        >
          <History className="w-4 h-4" /> Database ({history.length})
        </button>
      </div>

      {/* Context Banner */}
      {locationContext && (
        <div className="bg-brand-indigo/10 border border-brand-indigo/30 p-4 rounded-xl flex flex-col md:flex-row md:items-center gap-4 shadow-sm">
          <div className="flex items-start gap-3">
              <div className="p-2 bg-brand-indigo/20 rounded-lg">
                <MapPin className="w-5 h-5 text-brand-indigo" />
              </div>
              <div>
                 <h4 className="text-sm font-bold text-brand-indigo">Location Intelligence</h4>
                 <p className="text-xs text-brand-indigo/70 max-w-xl">{locationContext.trafficInfluencers.join(' ')}</p>
                 <p className="text-[10px] text-slate-600 mt-1 uppercase">Detected: {locationContext.address}</p>
              </div>
          </div>
        </div>
      )}

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-brand-panel p-4 rounded-xl border border-white/10 relative overflow-hidden group shadow-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity className="w-16 h-16 text-white" />
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Congestion</span>
            <ActivityIcon score={analysis.congestionLevel} />
          </div>
          <div className="text-2xl font-bold font-mono" style={{ color: congestionColor }}>
            {analysis.congestionLevel}%
          </div>
          <div className="flex items-center justify-between mt-1">
             <div className="text-xs text-slate-500">{analysis.trafficFlowStatus}</div>
             {analysis.sceneType && (
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-brand-cream">
                  {analysis.sceneType}
                </span>
             )}
          </div>
        </div>

        <div className="bg-brand-panel p-4 rounded-xl border border-white/10 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Avg Speed</span>
            <Clock className="w-4 h-4 text-brand-sky" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {analysis.estimatedAverageSpeed} <span className="text-sm text-slate-500">km/h</span>
          </div>
        </div>

        <div className="bg-brand-panel p-4 rounded-xl border border-white/10 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Pedestrians</span>
            <Users className="w-4 h-4 text-brand-indigo" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {analysis.pedestrianCount}
          </div>
        </div>

        <div className="bg-brand-panel p-4 rounded-xl border border-white/10 shadow-lg">
           <TrafficLightWidget lights={analysis.trafficLights} />
        </div>
      </div>

      {/* Active Tracking Network Panel */}
      {trackedItems.length > 0 && (
          <div className="bg-brand-panel p-6 rounded-xl border border-white/10 shadow-lg">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <ScanEye className="w-5 h-5 text-brand-sky" />
                    Active Tracking Network
                </h3>
                <span className="text-xs bg-brand-sky/10 text-brand-sky px-2 py-1 rounded border border-brand-sky/20">
                    {trackedItems.length} Objects Locked
                </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {trackedItems.slice(0, 8).map((item, i) => {
                    const isSpeeding = item.isSpeeding;
                    const isWrongWay = item.isWrongWay;
                    const isApproaching = (item.velocity || 0) > 0;
                    
                    let borderClass = 'border-white/10';
                    let bgClass = 'bg-black/20';
                    
                    if (isSpeeding) {
                        borderClass = 'border-brand-red shadow-[0_0_10px_rgba(255,107,107,0.2)] animate-pulse-slow';
                        bgClass = 'bg-brand-red/10';
                    } else if (isWrongWay) {
                        borderClass = 'border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.2)] animate-pulse-slow';
                        bgClass = 'bg-orange-950/20';
                    }

                    return (
                    <div key={i} className={`${bgClass} border ${borderClass} p-3 rounded-lg relative overflow-hidden group hover:border-brand-sky/50 transition-all`}>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold text-brand-cream truncate">{item.object}</span>
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                    item.laneEvent === 'Lane Change' ? 'bg-orange-500 animate-pulse' :
                                    item.laneEvent === 'Merging' ? 'bg-brand-cream animate-pulse' :
                                    'bg-green-500'
                                }`}></div>
                                <span className="text-[10px] text-brand-sky font-mono">ID:{item.trackId}</span>
                            </div>
                        </div>
                        <div className="flex items-end gap-1">
                            <span className={`text-lg font-mono font-bold ${isSpeeding ? 'text-brand-red' : 'text-white'}`}>
                                {item.estimatedSpeed || 0}
                            </span>
                            <span className="text-[10px] text-slate-500 mb-1">km/h</span>
                            {isSpeeding && <AlertTriangle className="w-3 h-3 text-brand-red mb-1.5 ml-1 animate-bounce" />}
                            
                            {item.velocity !== undefined && Math.abs(item.velocity) > 0.05 && (
                                <div className="ml-auto flex items-center text-[10px] text-slate-400 bg-white/5 px-1 rounded">
                                   {isApproaching ? <ArrowDown className="w-3 h-3 text-brand-sky" /> : <ArrowUp className="w-3 h-3 text-slate-500" />}
                                </div>
                            )}
                        </div>
                        
                        <div className="mt-2 text-[10px] flex items-center gap-1 min-h-[16px]">
                            {item.laneEvent && item.laneEvent !== 'Stable' ? (
                                <span className="text-orange-400 flex items-center gap-1">
                                   <ArrowRight className="w-3 h-3" /> {item.laneEvent}
                                </span>
                            ) : (
                                <span className="text-slate-500">Lane Stable</span>
                            )}
                        </div>

                         {/* Speed History Sparkline */}
                         {item.speedHistory && item.speedHistory.length > 2 && (
                             <div className="h-12 mt-2 bg-black/30 rounded border border-white/5 overflow-hidden relative">
                               <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={item.speedHistory.map((s, idx) => ({ idx, speed: s }))}>
                                   <defs>
                                     <linearGradient id={`speedGradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                                       <stop offset="5%" stopColor={isSpeeding ? "#FF6B6B" : "#7DD3FC"} stopOpacity={0.3}/>
                                       <stop offset="95%" stopColor={isSpeeding ? "#FF6B6B" : "#7DD3FC"} stopOpacity={0}/>
                                     </linearGradient>
                                   </defs>
                                   <Tooltip content={<CustomSparklineTooltip />} cursor={{ stroke: isSpeeding ? '#FF6B6B' : '#7DD3FC', strokeWidth: 1, opacity: 0.5 }} isAnimationActive={false} />
                                   <Area 
                                     type="monotone" 
                                     dataKey="speed" 
                                     stroke={isSpeeding ? "#FF6B6B" : "#7DD3FC"} 
                                     fill={`url(#speedGradient-${i})`}
                                     strokeWidth={2} 
                                     isAnimationActive={false} 
                                   />
                                 </AreaChart>
                               </ResponsiveContainer>
                             </div>
                         )}

                        <div className={`absolute bottom-0 left-0 w-full h-0.5 ${isSpeeding ? 'bg-brand-red' : isWrongWay ? 'bg-orange-500' : 'bg-brand-sky/50'}`}></div>
                    </div>
                );
                })}
            </div>
          </div>
      )}

      {/* Video Trend Chart */}
      {videoTrendData.length > 1 && (
         <div className="bg-brand-panel p-6 rounded-xl border border-white/10 shadow-lg">
            <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand-sky" />
              Live Traffic Flow Tracking
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={videoTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#151B2B', borderColor: '#334155', color: '#f1f5f9' }}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="vehicles" stroke="#7DD3FC" strokeWidth={3} dot={false} activeDot={{ r: 6 }} name="Vehicle Count" />
                  <Line yAxisId="right" type="monotone" dataKey="congestion" stroke="#FF6B6B" strokeWidth={2} dot={false} name="Congestion %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
         </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Charts */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-brand-panel p-6 rounded-xl border border-white/10 shadow-lg">
            <h3 className="text-lg font-semibold mb-4 text-white">Vehicle Classification (Current Frame)</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupedChartData}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#151B2B', borderColor: '#334155', color: '#f1f5f9' }}
                    itemStyle={{ color: '#7DD3FC' }}
                    cursor={{fill: '#334155', opacity: 0.4}}
                  />
                  <Bar dataKey="count" fill="#7DD3FC" radius={[4, 4, 0, 0]}>
                    {groupedChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.count > 5 ? '#F59E0B' : '#7DD3FC'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Violations Panel */}
          <div className="bg-brand-panel p-6 rounded-xl border border-white/10 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-brand-red" />
                Detected Violations ({analysis.detectedViolations.length})
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">PRIORITY SCORE:</span>
                <span className={`font-bold px-2 py-0.5 rounded ${report.priorityScore > 7 ? 'bg-brand-red/20 text-brand-red' : 'bg-green-500/20 text-green-400'}`}>
                  {report.priorityScore}/10
                </span>
              </div>
            </div>
            
            {analysis.detectedViolations.length > 0 ? (
              <ul className="space-y-2">
                {analysis.detectedViolations.map((v, i) => (
                  <li key={i} className="flex flex-col p-3 bg-brand-red/10 border border-brand-red/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        v.severity === 'High' ? 'bg-brand-red text-white' : 'bg-orange-500/80 text-white'
                      }`}>{v.type.toUpperCase()}</span>
                      <span className="text-xs text-brand-red/70">Severity: {v.severity}</span>
                    </div>
                    <span className="text-brand-cream/80 text-sm">{v.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 bg-green-950/20 border border-green-900/30 rounded-lg text-green-300 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                No significant violations detected.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Agent 3 Report */}
        <div className="bg-brand-panel p-6 rounded-xl border border-white/10 h-fit shadow-lg">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/10">
            <div className="w-8 h-8 rounded-full bg-brand-indigo flex items-center justify-center text-white font-bold text-sm">A3</div>
            <div>
              <h3 className="font-bold text-white">Traffic Report</h3>
              <p className="text-xs text-slate-400">Generated by Agent 3</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-brand-indigo uppercase tracking-wider mb-2">Summary</h4>
              <p className="text-slate-300 text-sm leading-relaxed">
                {report.summary}
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold text-brand-sky uppercase tracking-wider mb-2">Recommendations</h4>
              <ul className="space-y-2">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-brand-sky font-bold">›</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center">
               <span className="text-xs text-slate-500">ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
               <span className="text-xs bg-white/5 px-2 py-1 rounded text-slate-300">Gemini 2.5 Flash</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

const ActivityIcon = ({ score }: { score: number }) => {
  if (score > 75) return <TrendingUp className="w-5 h-5 text-brand-red" />;
  if (score > 40) return <TrendingUp className="w-5 h-5 text-orange-500" />;
  return <TrendingUp className="w-5 h-5 text-green-500" />;
};

const TrafficLightWidget = ({ lights }: { lights: TrafficLight[] | undefined }) => {
  const hasLights = lights && lights.length > 0;
  
  return (
    <div className="h-full flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 text-sm">Signals</span>
        <Zap className="w-4 h-4 text-brand-cream" />
      </div>
      
      {hasLights ? (
        <div className="flex items-center gap-3">
           {lights.map((light, i) => (
             <div key={i} className="flex items-center gap-2">
               <div className={`w-3 h-3 rounded-full ${
                 light.state === 'Red' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]' :
                 light.state === 'Green' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' :
                 light.state === 'Yellow' ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.6)]' :
                 'bg-slate-600'
               }`} />
               <span className="text-sm font-mono font-bold text-white">{light.state}</span>
             </div>
           ))}
        </div>
      ) : (
        <div className="text-sm text-slate-500 italic">
          No signals detected
        </div>
      )}
      
      <div className="text-xs text-slate-500 mt-1">
        {hasLights ? 'Active Monitoring' : 'n/a'}
      </div>
    </div>
  );
}