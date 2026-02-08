import React, { useState } from 'react';
import { FullAnalysisResult, DetectionItem, TrafficLight, HistoryItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { AlertTriangle, ShieldCheck, Car, Users, TrendingUp, Zap, MapPin, Clock, History, LayoutDashboard, Ban, Activity, ScanEye, ArrowRight, ExternalLink } from 'lucide-react';

interface ResultsDashboardProps {
  data: FullAnalysisResult | null;
  history: HistoryItem[];
  videoSessionData: FullAnalysisResult[];
  onLoadHistoryItem: (item: HistoryItem) => void;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ data, history, videoSessionData, onLoadHistoryItem }) => {
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');

  // If no live data is present but history exists, default to history view (unless explicitly live tab selected with no data, which handles gracefully)
  const effectiveTab = !data && history.length > 0 ? 'history' : activeTab;

  if (effectiveTab === 'history') {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between mb-4">
           <h3 className="text-xl font-bold text-white flex items-center gap-2">
             <History className="w-5 h-5 text-cyan-400" />
             Analysis Database
           </h3>
           {data && <button onClick={() => setActiveTab('live')} className="text-sm text-slate-400 hover:text-white">Back to Live</button>}
        </div>
        
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left text-slate-400">
               <thead className="text-xs text-slate-200 uppercase bg-slate-900/50">
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
                   <tr key={item.id} className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors">
                     <td className="px-4 py-3 font-mono">{new Date(item.timestamp).toLocaleTimeString()}</td>
                     <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                           <img src={item.thumbnail} alt="thumb" className="w-10 h-6 object-cover rounded border border-slate-600" />
                           <span className="text-xs truncate max-w-[150px]">{item.locationContext?.address || 'Unknown'}</span>
                        </div>
                     </td>
                     <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Car className="w-3 h-3" /> {item.analysis.totalVehicles}
                            <Users className="w-3 h-3 ml-1" /> {item.analysis.pedestrianCount}
                        </div>
                     </td>
                     <td className="px-4 py-3">
                       <span className={`px-2 py-1 rounded text-xs ${item.analysis.congestionLevel > 70 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                         {item.analysis.congestionLevel}%
                       </span>
                     </td>
                     <td className="px-4 py-3">
                       {item.analysis.detectedViolations.length > 0 ? (
                         <span className="text-red-400 flex items-center gap-1"><Ban className="w-3 h-3" /> {item.analysis.detectedViolations.length}</span>
                       ) : (
                         <span className="text-green-500/50">-</span>
                       )}
                     </td>
                     <td className="px-4 py-3 text-right">
                        <button 
                          onClick={() => onLoadHistoryItem(item)}
                          className="px-3 py-1 bg-cyan-900/40 text-cyan-400 hover:bg-cyan-900/60 hover:text-white rounded text-xs font-medium border border-cyan-800/50 flex items-center gap-1 ml-auto"
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
  
  // Group Detections for Chart
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
  
  const congestionColor = analysis.congestionLevel > 75 ? '#ef4444' : analysis.congestionLevel > 40 ? '#f59e0b' : '#22c55e';
  
  // Filter only Tracked Items
  const trackedItems = detections.filter(d => d.trackId !== undefined);

  // Process video trend data
  const videoTrendData = videoSessionData.map((d, idx) => ({
    time: idx + 's',
    vehicles: d.analysis.totalVehicles,
    congestion: d.analysis.congestionLevel
  }));

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Navigation */}
      <div className="flex items-center gap-4 border-b border-slate-800 pb-1">
        <button 
          onClick={() => setActiveTab('live')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'live' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <LayoutDashboard className="w-4 h-4" /> Live Analysis
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <History className="w-4 h-4" /> Database ({history.length})
        </button>
      </div>

      {/* Context Banner (Maps Grounding) */}
      {locationContext && (
        <div className="bg-indigo-950/30 border border-indigo-500/30 p-4 rounded-xl flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <MapPin className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                 <h4 className="text-sm font-bold text-indigo-300">Location Intelligence</h4>
                 <p className="text-xs text-indigo-200/70 max-w-xl">{locationContext.trafficInfluencers.join(' ')}</p>
                 <p className="text-[10px] text-slate-500 mt-1 uppercase">Detected: {locationContext.address}</p>
              </div>
          </div>
        </div>
      )}

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Congestion</span>
            <ActivityIcon score={analysis.congestionLevel} />
          </div>
          <div className="text-2xl font-bold font-mono" style={{ color: congestionColor }}>
            {analysis.congestionLevel}%
          </div>
          <div className="text-xs text-slate-500 mt-1">{analysis.trafficFlowStatus}</div>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Avg Speed</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {analysis.estimatedAverageSpeed} <span className="text-sm text-slate-500">km/h</span>
          </div>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Pedestrians</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {analysis.pedestrianCount}
          </div>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
           <TrafficLightWidget lights={analysis.trafficLights} />
        </div>
      </div>

      {/* Active Tracking Network Panel */}
      {trackedItems.length > 0 && (
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                    <ScanEye className="w-5 h-5 text-cyan-400" />
                    Active Tracking Network
                </h3>
                <span className="text-xs bg-cyan-900/50 text-cyan-300 px-2 py-1 rounded border border-cyan-800">
                    {trackedItems.length} Objects Locked
                </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {trackedItems.slice(0, 8).map((item, i) => (
                    <div key={i} className="bg-slate-900/50 border border-slate-700 p-3 rounded-lg relative overflow-hidden">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold text-slate-300 truncate">{item.object}</span>
                            <div className="flex items-center gap-2">
                                {/* LANE STATUS INDICATOR DOT */}
                                <div className={`w-2 h-2 rounded-full ${
                                    item.laneEvent === 'Lane Change' ? 'bg-orange-500 animate-pulse' :
                                    item.laneEvent === 'Merging' ? 'bg-yellow-400 animate-pulse' :
                                    'bg-green-500'
                                }`} title={`Lane Status: ${item.laneEvent || 'Stable'}`}></div>
                                <span className="text-[10px] text-cyan-400 font-mono">ID:{item.trackId}</span>
                            </div>
                        </div>
                        <div className="flex items-end gap-1">
                            <span className="text-lg font-mono font-bold text-white">{item.estimatedSpeed || 0}</span>
                            <span className="text-[10px] text-slate-500 mb-1">km/h</span>
                        </div>
                        
                        <div className="mt-2 text-[10px] flex items-center gap-1 min-h-[16px]">
                            {item.laneEvent && item.laneEvent !== 'Stable' ? (
                                <span className="text-orange-400 flex items-center gap-1">
                                   <ArrowRight className="w-3 h-3" /> {item.laneEvent}
                                </span>
                            ) : (
                                <span className="text-slate-600">Lane Stable</span>
                            )}
                        </div>
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-cyan-500/30"></div>
                    </div>
                ))}
            </div>
          </div>
      )}

      {/* Video Trend Chart (Only visible if data exists) */}
      {videoTrendData.length > 1 && (
         <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h3 className="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
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
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="vehicles" stroke="#06b6d4" strokeWidth={3} dot={false} activeDot={{ r: 6 }} name="Vehicle Count" />
                  <Line yAxisId="right" type="monotone" dataKey="congestion" stroke="#ef4444" strokeWidth={2} dot={false} name="Congestion %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
         </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Charts */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h3 className="text-lg font-semibold mb-4 text-slate-200">Vehicle Classification (Current Frame)</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupedChartData}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                    itemStyle={{ color: '#22d3ee' }}
                    cursor={{fill: '#334155', opacity: 0.4}}
                  />
                  <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]}>
                    {groupedChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.count > 5 ? '#f59e0b' : '#06b6d4'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Violations Panel */}
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Detected Violations ({analysis.detectedViolations.length})
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">PRIORITY SCORE:</span>
                <span className={`font-bold px-2 py-0.5 rounded ${report.priorityScore > 7 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                  {report.priorityScore}/10
                </span>
              </div>
            </div>
            
            {analysis.detectedViolations.length > 0 ? (
              <ul className="space-y-2">
                {analysis.detectedViolations.map((v, i) => (
                  <li key={i} className="flex flex-col p-3 bg-red-950/10 border border-red-900/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        v.severity === 'High' ? 'bg-red-500 text-white' : 'bg-orange-500/80 text-white'
                      }`}>{v.type.toUpperCase()}</span>
                      <span className="text-xs text-red-300/70">Severity: {v.severity}</span>
                    </div>
                    <span className="text-red-200 text-sm">{v.description}</span>
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
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 h-fit">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-700">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">A3</div>
            <div>
              <h3 className="font-bold text-white">Traffic Report</h3>
              <p className="text-xs text-slate-400">Generated by Agent 3</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider mb-2">Summary</h4>
              <p className="text-slate-300 text-sm leading-relaxed">
                {report.summary}
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-2">Recommendations</h4>
              <ul className="space-y-2">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-cyan-500 font-bold">›</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-700 flex justify-between items-center">
               <span className="text-xs text-slate-500">ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
               <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">Gemini 2.5 Flash</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

const ActivityIcon = ({ score }: { score: number }) => {
  if (score > 75) return <TrendingUp className="w-5 h-5 text-red-500" />;
  if (score > 40) return <TrendingUp className="w-5 h-5 text-orange-500" />;
  return <TrendingUp className="w-5 h-5 text-green-500" />;
};

const TrafficLightWidget = ({ lights }: { lights: TrafficLight[] | undefined }) => {
  const hasLights = lights && lights.length > 0;
  
  return (
    <div className="h-full flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 text-sm">Signals</span>
        <Zap className="w-4 h-4 text-yellow-400" />
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