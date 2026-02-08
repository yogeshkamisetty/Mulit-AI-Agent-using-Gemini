import { DetectionItem } from "../types";

// Types for internal tracker state
interface TrackedObject {
  id: number;
  class: string;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  centroid: [number, number]; // [x, y] normalized
  history: [number, number][]; // History of centroids
  missingFrames: number;
  speed: number;
  dy: number; // Vertical velocity component
  laneStatus: 'Stable' | 'Lane Change' | 'Merging';
  createdAt: number;
  updatedAt: number; // Last update timestamp for dt calc
  // Violation counters for persistence
  wrongWayFrames: number;
  speedingFrames: number;
}

export class ObjectTracker {
  private tracks: TrackedObject[] = [];
  private nextId = 1;
  // Tuned Parameters
  private maxMissingFrames = 5; 
  private iouThreshold = 0.2; 
  private centroidDistanceThreshold = 0.15; 
  
  // Speed Calculation Scalar
  // Assuming 1.0 normalized height ~ 50 meters real world
  // Speed (km/h) = (dy / dt_seconds) * 50 * 3.6
  // Scalar ~ 180-200.
  private SPEED_SCALAR = 200;

  // Violation Thresholds
  public SPEED_LIMIT_DEFAULT = 80; 
  public SPEED_LIMIT_HEAVY = 60; // Bus/Truck
  public SPEED_LIMIT_LIGHT = 50; // Auto-Rickshaw

  // Smoothing Factor
  private SMOOTHING_FACTOR = 0.3;

  constructor() {}

  // Main update method called with new detections from API
  public update(detections: DetectionItem[], timestamp: number): DetectionItem[] {
    const validDetections = detections.filter(d => d.box_2d && d.type === 'vehicle');
    
    // 1. Predict
    this.tracks.forEach(t => t.missingFrames++);

    // 2. Match
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
        
        // Priority 2: Centroid Distance
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
        
        // Time Delta Calculation
        const dt = (timestamp - track.updatedAt) / 1000; // seconds
        track.updatedAt = timestamp;

        // Exponential Moving Average for Box Smoothing
        track.box = [
            this.lerp(track.box[0], match.box_2d![0], this.SMOOTHING_FACTOR),
            this.lerp(track.box[1], match.box_2d![1], this.SMOOTHING_FACTOR),
            this.lerp(track.box[2], match.box_2d![2], this.SMOOTHING_FACTOR),
            this.lerp(track.box[3], match.box_2d![3], this.SMOOTHING_FACTOR)
        ];
        
        const newCentroid = this.getCentroid(track.box);
        const deltaY = newCentroid[1] - track.centroid[1]; 
        
        track.dy = deltaY;
        
        // Physics-based Speed Calculation
        let calculatedSpeed = 0;
        if (dt > 0.1 && dt < 10) { // Ignore first frame (dt=0) or huge jumps
            const velocity = Math.abs(deltaY) / dt; // normalized units per second
            calculatedSpeed = Math.floor(velocity * this.SPEED_SCALAR);
        }
        
        // Smooth the speed to avoid jitter
        // If calculatedSpeed is 0 (stationary), decay faster
        const alpha = calculatedSpeed === 0 ? 0.5 : 0.2;
        track.speed = Math.floor(track.speed * (1 - alpha) + calculatedSpeed * alpha);

        track.history.push(newCentroid);
        if (track.history.length > 8) track.history.shift();

        // Lane Discipline Logic
        if (track.history.length >= 2) {
            const historyDepth = Math.min(track.history.length, 4);
            const startX = track.history[track.history.length - historyDepth][0];
            const endX = newCentroid[0];
            const lateralDisplacement = Math.abs(endX - startX);
            
            if (lateralDisplacement > 0.03) { // Threshold for lane change detection
                track.laneStatus = 'Lane Change';
            } else {
                track.laneStatus = 'Stable';
            }
        }

        track.centroid = newCentroid;

        // Sync track data to detection
        match.trackId = track.id;
        match.box_2d = track.box; 
        match.estimatedSpeed = track.speed;
        match.laneEvent = track.laneStatus;
      }
    });

    // 3. Create New Tracks
    unmatchedDetections.forEach(index => {
      const det = validDetections[index];
      if (det.box_2d) {
        const newCentroid = this.getCentroid(det.box_2d);
        const newTrack: TrackedObject = {
          id: this.nextId++,
          class: det.object,
          box: det.box_2d,
          centroid: newCentroid,
          history: [newCentroid],
          missingFrames: 0,
          speed: 0,
          dy: 0,
          laneStatus: 'Stable',
          createdAt: timestamp,
          updatedAt: timestamp,
          wrongWayFrames: 0,
          speedingFrames: 0
        };
        this.tracks.push(newTrack);
        
        det.trackId = newTrack.id;
        det.estimatedSpeed = 0;
        det.laneEvent = 'Stable';
      }
    });

    // 4. Violation Checks
    
    // Determine Traffic Flow Direction
    // Calculate average vertical direction of all moving vehicles
    const activeMovingTracks = this.tracks.filter(t => t.missingFrames === 0 && Math.abs(t.dy) > 0.002); 
    let dominantDy = 0;
    if (activeMovingTracks.length > 2) { // Need quorum for flow direction
        const totalDy = activeMovingTracks.reduce((sum, t) => sum + t.dy, 0);
        dominantDy = totalDy / activeMovingTracks.length; 
    }

    validDetections.forEach(det => {
        if (!det.trackId) return;
        const track = this.tracks.find(t => t.id === det.trackId);
        if (!track) return;

        // SPEEDING CHECK: Dynamic Limits based on Vehicle Type
        let speedLimit = this.SPEED_LIMIT_DEFAULT;
        const type = (track.class || '').toLowerCase();
        
        if (type.includes('bus') || type.includes('truck') || type.includes('lorry')) {
            speedLimit = this.SPEED_LIMIT_HEAVY;
        } else if (type.includes('rickshaw') || type.includes('auto') || type.includes('tuk')) {
            speedLimit = this.SPEED_LIMIT_LIGHT;
        }

        if (track.speed > speedLimit) {
            track.speedingFrames++;
        } else {
            track.speedingFrames = Math.max(0, track.speedingFrames - 1);
        }

        if (track.speedingFrames >= 2) { // Persistence check (2 frames)
             det.isSpeeding = true;
        }

        // WRONG WAY CHECK: Flow Analysis
        // Must be moving significant speed to count as wrong way (avoid jitter stationary)
        // And traffic flow must be well defined (dominantDy is significant)
        if (Math.abs(dominantDy) > 0.005 && Math.abs(track.dy) > 0.005) {
             // If direction opposes the dominant flow
             if (Math.sign(dominantDy) !== Math.sign(track.dy)) {
                 track.wrongWayFrames++;
             } else {
                 track.wrongWayFrames = 0;
             }
        }

        if (track.wrongWayFrames >= 3) { // Persistence check (3 frames)
             det.isWrongWay = true;
        }
    });

    // 5. Cleanup
    this.tracks = this.tracks.filter(t => t.missingFrames <= this.maxMissingFrames);

    return detections;
  }

  public reset() {
    this.tracks = [];
    this.nextId = 1;
  }

  // Helpers
  private lerp(start: number, end: number, factor: number): number {
      return start + (end - start) * factor;
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
}