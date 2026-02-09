
export enum AgentStatus {
  IDLE = 'IDLE',
  VISION_SCANNING = 'VISION_SCANNING', // Agent 1
  DATA_ANALYSIS = 'DATA_ANALYSIS',     // Agent 2
  REPORT_GENERATION = 'REPORT_GENERATION', // Agent 3
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface DetectionItem {
  object: string;
  count: number;
  confidence: number;
  type: 'vehicle' | 'pedestrian' | 'infrastructure' | 'other';
  // New Tracking Fields
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] (Normalized 0-1000)
  trackId?: number;
  estimatedSpeed?: number; // km/h (Absolute magnitude)
  velocity?: number; // Normalized units/sec (Signed direction)
  laneEvent?: 'Stable' | 'Lane Change' | 'Merging';
  isSpeeding?: boolean; // New: Tracking derived
  isWrongWay?: boolean; // New: Tracking derived
  speedHistory?: number[]; // New: For visualization
}

export interface TrafficLight {
  state: 'Red' | 'Yellow' | 'Green' | 'Off';
  count: number;
}

export interface Violation {
  type: 'Red Light' | 'Jaywalking' | 'Wrong Lane' | 'Speeding' | 'Other';
  description: string;
  severity: 'Low' | 'Medium' | 'High';
}

export interface TrafficAnalysis {
  totalVehicles: number;
  pedestrianCount: number;
  trafficLights: TrafficLight[];
  congestionLevel: number; // 0-100
  trafficFlowStatus: 'Free Flow' | 'Moderate' | 'Heavy' | 'Gridlock';
  sceneType?: 'Highway' | 'Intersection' | 'City Street' | 'Parking Lot' | 'Tunnel' | 'Other';
  estimatedAverageSpeed: number; // km/h
  detectedViolations: Violation[];
}

export interface TrafficReport {
  summary: string;
  recommendations: string[];
  priorityScore: number; // 1-10
}

export interface LocationContextData {
  latitude?: number;
  longitude?: number;
  address?: string;
  nearbyPlaces: {
    name: string;
    type: string;
    distance: string;
  }[];
  trafficInfluencers: string[];
}

export interface FullAnalysisResult {
  timestamp: number;
  detections: DetectionItem[];
  analysis: TrafficAnalysis;
  report: TrafficReport;
  locationContext?: LocationContextData;
}

export interface HistoryItem extends FullAnalysisResult {
  id: string;
  thumbnail: string; // Base64 thumbnail
}