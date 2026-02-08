import { DetectionItem } from "../types";

interface KalmanState {
  y: number;    // Position (normalized 0-1)
  v: number;    // Velocity (normalized units / s)
  p11: number;  // Variance y
  p12: number;  // Covariance y,v
  p21: number;  // Covariance v,y
  p22: number;  // Variance v
}

interface TrackedObject {
  id: number;
  class: string;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  centroid: [number, number]; // [x, y] normalized
  avgHeight: number; // Smoothed normalized height for depth scaling
  laneHistory: number[]; // Store recent X positions for lane analysis
  missingFrames: number;
  speed: number;    // km/h (Absolute)
  velocity: number; // km/h (Signed)
  laneStatus: 'Stable' | 'Lane Change' | 'Merging';
  createdAt: number;
  updatedAt: number; // Last update timestamp
  // Violation counters
  wrongWayFrames: number;
  speedingFrames: number;
  // Filter State
  kalman: KalmanState;
}

// Typical lengths in meters used for auto-calibration
const REFERENCE_LENGTHS_METERS: Record<string, number> = {
  'car': 4.5,
  'taxi': 4.5,
  'suv': 4.8,
  'van': 5.2,
  'truck': 12.0,
  'lorry': 12.0,
  'bus': 12.0,
  'pickup': 5.2,
  'motorcycle': 2.2,
  'bike': 1.8,
  'bicycle': 1.8,
  'person': 0.5,
  'pedestrian': 0.5,
  'human': 0.5,
  'default': 4.5
};

export class ObjectTracker {
  private tracks: TrackedObject[] = [];
  private nextId = 1;
  
  // Tracking Parameters
  private maxMissingFrames = 5; 
  private iouThreshold = 0.25; 
  private centroidDistanceThreshold = 0.15; 
  
  // Violation Thresholds
  public SPEED_LIMIT_DEFAULT = 80; 
  public SPEED_LIMIT_HEAVY = 60; 
  public SPEED_LIMIT_LIGHT = 50; 

  // Kalman Filter Tuning
  private R = 0.005;     // Measurement Noise (approx 0.5% screen height jitter)
  private Q_pos = 0.001; // Process Noise Position (low, model is accurate)
  private Q_vel = 0.8;   // Process Noise Velocity (higher to catch braking/acceleration)

  constructor() {}

  public update(detections: DetectionItem[], timestamp: number): DetectionItem[] {
    const validDetections = detections.filter(d => d.box_2d && d.type === 'vehicle');
    
    // 1. Prediction Step (Age Tracks)
    this.tracks.forEach(t => t.missingFrames++);

    // 2. Matching Step (Greedy Association)
    const unmatchedDetections = new Set(validDetections.map((_, i) => i));
    
    this.tracks.forEach(track => {
      let bestMatchIndex = -1;
      let bestScore = -1;

      validDetections.forEach((det, index) => {
        if (!unmatchedDetections.has(index) || !det.box_2d) return;
        
        // Priority 1: IoU
        const iou = this.calculateIoU(track.box, det.box_2d);
        if (iou > this.iouThreshold && iou > bestScore) {
          bestScore = iou;
          bestMatchIndex = index;
        }
        
        // Priority 2: Centroid Distance (Backup for fast moving objects)
        if (bestMatchIndex === -1) {
            const detCentroid = this.getCentroid(det.box_2d);
            const dist = Math.sqrt(
                Math.pow(detCentroid[0] - track.centroid[0], 2) + 
                Math.pow(detCentroid[1] - track.centroid[1], 2)
            );
            
            if (dist < this.centroidDistanceThreshold) {
                const score = (1 - dist) * 0.5; 
                if (score > bestScore) {
                    bestScore = score;
                    bestMatchIndex = index;
                }
            }
        }
      });

      if (bestMatchIndex !== -1) {
        unmatchedDetections.delete(bestMatchIndex);
        const match = validDetections[bestMatchIndex];
        
        track.missingFrames = 0;
        
        const dt = (timestamp - track.updatedAt) / 1000; // seconds
        track.updatedAt = timestamp;
        
        const newCentroid = this.getCentroid(match.box_2d!);
        const currentHeight = (match.box_2d![2] - match.box_2d![0]) / 1000;

        // Kalman Filter Update
        // Only update if time has passed, otherwise just update position
        if (dt > 0.001) {
           this.updateKalman(track.kalman, newCentroid[1], dt);
        } else {
           // Reset position if duplicate frame
           track.kalman.y = newCentroid[1];
        }

        // Update Track State
        track.box = match.box_2d!;
        track.centroid = newCentroid;
        // Smooth height to avoid jitter affecting speed scale
        track.avgHeight = track.avgHeight * 0.9 + currentHeight * 0.1;
        
        // --- CALIBRATED SPEED ESTIMATION ---
        // V (unit/s) / Height (unit) = Speed in "Vehicle Lengths per Second"
        // Speed (m/s) = (V / Height) * Real_Length_M
        
        const v_norm_per_sec = track.kalman.v;
        const refLength = this.getReferenceLength(track.class);
        const safeHeight = Math.max(track.avgHeight, 0.02); // Avoid div/0
        
        // Perspective Factor: 
        // In most camera angles, vertical movement (Y) is compressed relative to vertical size (H)
        // because H represents the object length projected, while Y represents ground distance.
        // A factor of 1.0 implies top-down. 
        // A factor > 1.0 implies a shallower angle. 
        // 1.0 is a safe conservative baseline for "pixels per pixel" logic.
        const perspectiveFactor = 1.0; 

        const speedMps = (Math.abs(v_norm_per_sec) / safeHeight) * refLength * perspectiveFactor;
        
        track.velocity = speedMps * 3.6 * Math.sign(v_norm_per_sec); // Signed km/h
        track.speed = Math.abs(track.velocity);                      // Absolute km/h

        // Lane Discipline Logic
        track.laneHistory.push(newCentroid[0]);
        if (track.laneHistory.length > 10) track.laneHistory.shift();
        this.updateLaneStatus(track);

        // Sync Track Data to Detection Item
        match.trackId = track.id;
        match.estimatedSpeed = Math.floor(track.speed);
        match.laneEvent = track.laneStatus;
      }
    });

    // 3. Creation Step (New Tracks)
    unmatchedDetections.forEach(index => {
      const det = validDetections[index];
      if (det.box_2d) {
        const newCentroid = this.getCentroid(det.box_2d);
        const newHeight = (det.box_2d[2] - det.box_2d[0]) / 1000;
        
        const newTrack: TrackedObject = {
          id: this.nextId++,
          class: det.object,
          box: det.box_2d,
          centroid: newCentroid,
          avgHeight: newHeight,
          laneHistory: [newCentroid[0]],
          missingFrames: 0,
          speed: 0,
          velocity: 0,
          laneStatus: 'Stable',
          createdAt: timestamp,
          updatedAt: timestamp,
          wrongWayFrames: 0,
          speedingFrames: 0,
          kalman: this.initKalman(newCentroid[1])
        };
        this.tracks.push(newTrack);
        
        det.trackId = newTrack.id;
        det.estimatedSpeed = 0;
        det.laneEvent = 'Stable';
      }
    });

    // 4. Analysis Step (Violations)
    this.checkViolations(validDetections);

    // 5. Cleanup Step
    this.tracks = this.tracks.filter(t => t.missingFrames <= this.maxMissingFrames);

    return detections;
  }

  public reset() {
    this.tracks = [];
    this.nextId = 1;
  }

  // --- Helpers ---

  private getReferenceLength(type: string): number {
      const t = type.toLowerCase();
      for (const key in REFERENCE_LENGTHS_METERS) {
          if (t.includes(key)) return REFERENCE_LENGTHS_METERS[key];
      }
      return REFERENCE_LENGTHS_METERS['default'];
  }

  private checkViolations(detections: DetectionItem[]) {
      // Determine Traffic Flow Direction (Average of all moving vehicles)
      const movingTracks = this.tracks.filter(t => t.speed > 5); // Ignore stationary
      let flowDir = 0;
      if (movingTracks.length > 0) {
          const sumV = movingTracks.reduce((acc, t) => acc + t.velocity, 0);
          flowDir = sumV / movingTracks.length;
      }

      detections.forEach(d => {
          if (!d.trackId) return;
          const track = this.tracks.find(t => t.id === d.trackId);
          if (!track) return;

          // Speeding Check
          let limit = this.SPEED_LIMIT_DEFAULT;
          const type = (track.class || '').toLowerCase();
          
          if (type.includes('bus') || type.includes('truck') || type.includes('lorry')) {
              limit = this.SPEED_LIMIT_HEAVY;
          } else if (type.includes('rickshaw') || type.includes('auto') || type.includes('bike')) {
              limit = this.SPEED_LIMIT_LIGHT;
          }

          if (track.speed > limit) {
              track.speedingFrames++;
          } else {
              track.speedingFrames = Math.max(0, track.speedingFrames - 1);
          }

          if (track.speedingFrames >= 2) { 
               d.isSpeeding = true;
          }

          // Wrong Way Check
          // Requires significant flow speed and vehicle speed to be confident
          if (Math.abs(flowDir) > 10 && track.speed > 10) {
               // If signs are opposite
               if (Math.sign(track.velocity) !== Math.sign(flowDir)) {
                   track.wrongWayFrames++;
               } else {
                   track.wrongWayFrames = 0;
               }
          }
          if (track.wrongWayFrames >= 3) { 
               d.isWrongWay = true;
          }
      });
  }

  private updateLaneStatus(track: TrackedObject) {
      if (track.laneHistory.length < 5) return;
      
      const recent = track.laneHistory.slice(-5);
      const minX = Math.min(...recent);
      const maxX = Math.max(...recent);
      const variance = maxX - minX;

      // 0.05 normalized width is about 5% of screen width.
      // If moving laterally more than 5% in 5 frames, likely changing lanes
      if (variance > 0.05) {
         track.laneStatus = 'Lane Change';
      } else {
         track.laneStatus = 'Stable';
      }
  }

  private getCentroid(box: [number, number, number, number]): [number, number] {
    const y = (box[0] + box[2]) / 2 / 1000;
    const x = (box[1] + box[3]) / 2 / 1000;
    return [x, y];
  }

  private calculateIoU(boxA: number[], boxB: number[]): number {
    const yA = Math.max(boxA[0], boxB[0]);
    const xA = Math.max(boxA[1], boxB[1]);
    const yB = Math.min(boxA[2], boxB[2]);
    const xB = Math.min(boxA[3], boxB[3]);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
    const boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);

    if (boxAArea + boxBArea - interArea === 0) return 0;
    return interArea / (boxAArea + boxBArea - interArea);
  }

  // --- Kalman Filter Implementation ---

  private initKalman(y: number): KalmanState {
    return {
      y: y,
      v: 0,
      p11: 1, p12: 0,
      p21: 0, p22: 1
    };
  }

  private updateKalman(state: KalmanState, measurement: number, dt: number) {
    // 1. Predict
    // x_pred = F x
    const pred_y = state.y + state.v * dt;
    const pred_v = state.v;
    
    // P_pred = F P F^T + Q
    const dt2 = dt * dt;
    const pp11 = state.p11 + dt * (state.p12 + state.p21) + dt2 * state.p22 + (this.Q_pos * dt);
    const pp12 = state.p12 + dt * state.p22;
    const pp21 = state.p21 + dt * state.p22;
    const pp22 = state.p22 + (this.Q_vel * dt);

    // 2. Update
    // y_innov = z - H x_pred
    const y_innov = measurement - pred_y;
    
    // S = H P_pred H^T + R
    const s = pp11 + this.R;
    
    // K = P_pred H^T S^-1
    const k1 = pp11 / s;
    const k2 = pp21 / s; 

    // x_new = x_pred + K y_innov
    state.y = pred_y + k1 * y_innov;
    state.v = pred_v + k2 * y_innov;

    // P_new = (I - K H) P_pred
    const p11_new = (1 - k1) * pp11;
    const p12_new = (1 - k1) * pp12;
    const p21_new = -k2 * pp11 + pp21;
    const p22_new = -k2 * pp12 + pp22;

    state.p11 = p11_new;
    state.p12 = p12_new;
    state.p21 = p21_new;
    state.p22 = p22_new;
  }
}