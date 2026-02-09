import { GoogleGenAI, Type } from "@google/genai";
import { FullAnalysisResult, LocationContextData, DetectionItem, TrafficAnalysis, TrafficReport } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SCHEMAS ---

// Fast Schema: Detections + Basic Stats Only
const fastAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    detections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          object: { type: Type.STRING },
          count: { type: Type.INTEGER },
          confidence: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ["vehicle", "pedestrian", "infrastructure", "other"] },
          box_2d: {
             type: Type.ARRAY,
             description: "Bounding box [ymin, xmin, ymax, xmax] normalized 0-1000",
             items: { type: Type.INTEGER } 
          }
        }
      }
    },
    congestionLevel: { type: Type.INTEGER },
    trafficFlowStatus: { type: Type.STRING, enum: ["Free Flow", "Moderate", "Heavy", "Gridlock"] },
  },
  required: ["detections", "congestionLevel", "trafficFlowStatus"]
};

// Full Schema: Everything including text reports and scene type
const fullAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    detections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          object: { type: Type.STRING },
          count: { type: Type.INTEGER },
          confidence: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ["vehicle", "pedestrian", "infrastructure", "other"] },
          box_2d: {
             type: Type.ARRAY,
             items: { type: Type.INTEGER } 
          }
        }
      }
    },
    analysis: {
      type: Type.OBJECT,
      properties: {
        totalVehicles: { type: Type.INTEGER },
        pedestrianCount: { type: Type.INTEGER },
        trafficLights: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              state: { type: Type.STRING, enum: ["Red", "Yellow", "Green", "Off"] },
              count: { type: Type.INTEGER }
            }
          }
        },
        congestionLevel: { type: Type.INTEGER },
        trafficFlowStatus: { type: Type.STRING, enum: ["Free Flow", "Moderate", "Heavy", "Gridlock"] },
        sceneType: { type: Type.STRING, enum: ["Highway", "Intersection", "City Street", "Parking Lot", "Tunnel", "Other"] },
        estimatedAverageSpeed: { type: Type.INTEGER },
        detectedViolations: { 
          type: Type.ARRAY, 
          items: { 
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ["Red Light", "Jaywalking", "Wrong Lane", "Speeding", "Other"] },
              description: { type: Type.STRING },
              severity: { type: Type.STRING, enum: ["Low", "Medium", "High"] }
            }
          }
        }
      }
    },
    report: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        recommendations: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        priorityScore: { type: Type.INTEGER }
      }
    }
  },
  required: ["detections", "analysis", "report"]
};

// --- UTILITIES ---

// Optimize image size to reduce latency (Target 800px width)
// Updated to handle raw base64 or data URIs
export const optimizeBase64Image = (base64Str: string, maxWidth = 800, mimeType = 'image/jpeg'): Promise<string> => {
  return new Promise((resolve) => {
    // Ensure we have a valid data URI for the Image object
    // If it's already a Data URI, use it. If it's raw base64, add prefix.
    const hasPrefix = base64Str.startsWith('data:');
    const src = hasPrefix ? base64Str : `data:${mimeType};base64,${base64Str}`;

    const img = new Image();
    img.src = src;
    
    img.onload = () => {
      const scale = maxWidth / img.width;
      // List of explicitly supported formats by Gemini
      const supportedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      
      // If the image is small enough AND the format is supported, skip canvas (preserves quality/transparency)
      // Otherwise, we draw to canvas to resize OR to convert format (e.g. BMP -> PNG)
      if (scale >= 1 && supportedFormats.includes(mimeType)) {
        resolve(src); // Return as Data URI
        return;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(img.width, maxWidth);
      canvas.height = img.height * (canvas.width / img.width);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Reduce quality slightly for speed, default to JPEG or requested supported type
        const outputMime = supportedFormats.includes(mimeType) ? mimeType : 'image/jpeg';
        resolve(canvas.toDataURL(outputMime, 0.85)); 
      } else {
        resolve(src);
      }
    };

    img.onerror = () => {
      // If image loading fails, resolve with the valid Data URI `src`.
      resolve(src);
    };
  });
};

const calculateIoU = (boxA: number[], boxB: number[]): number => {
    const yA = Math.max(boxA[0], boxB[0]);
    const xA = Math.max(boxA[1], boxB[1]);
    const yB = Math.min(boxA[2], boxB[2]);
    const xB = Math.min(boxA[3], boxB[3]);
    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
    const boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);
    if (boxAArea + boxBArea - interArea === 0) return 0;
    return interArea / (boxAArea + boxBArea - interArea);
};

const applyNMS = (detections: any[], iouThreshold: number = 0.5): any[] => {
    if (!detections || detections.length === 0) return [];
    const validDetections = detections.filter(d => d.box_2d && d.box_2d.length === 4);
    validDetections.sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5));
    const selected: any[] = [];
    const active = new Array(validDetections.length).fill(true);

    for (let i = 0; i < validDetections.length; i++) {
        if (!active[i]) continue;
        selected.push(validDetections[i]);
        for (let j = i + 1; j < validDetections.length; j++) {
            if (!active[j]) continue;
            const iou = calculateIoU(validDetections[i].box_2d, validDetections[j].box_2d);
            if (iou > iouThreshold) active[j] = false;
        }
    }
    return selected;
};

const cleanJsonString = (str: string): string => {
  if (!str) return "";
  let cleanStr = str.trim();
  if (cleanStr.startsWith("```json")) cleanStr = cleanStr.substring(7);
  if (cleanStr.startsWith("```")) cleanStr = cleanStr.substring(3);
  if (cleanStr.endsWith("```")) cleanStr = cleanStr.substring(0, cleanStr.length - 3);
  return cleanStr.trim();
};

const handleGeminiError = (error: any): never => {
  console.error("Gemini API Error:", error);
  const msg = error.message || "";
  if (msg.includes("429")) throw new Error("Rate Limit: System overloaded. Retrying...");
  throw error;
};

// --- API METHODS ---

/**
 * Fast detection for Real-time Loops (Video/Camera)
 * Only returns bounding boxes and congestion levels.
 */
export const analyzeTrafficFast = async (base64Image: string, mimeType: string): Promise<Partial<FullAnalysisResult>> => {
    const modelId = "gemini-2.5-flash"; 
    
    try {
        // Pass mimeType to optimizer
        const optimizedImage = await optimizeBase64Image(base64Image, 640, mimeType); 
        
        // FIX: Extract the ACTUAL mime type and data from the optimized result.
        // optimizeBase64Image might convert the format (e.g. BMP -> JPEG), so we must trust its output header.
        const match = optimizedImage.match(/^data:(.*);base64,(.*)$/);
        const actualMimeType = match ? match[1] : mimeType;
        const base64Data = match ? match[2] : optimizedImage.split(',')[1];
        
        const response = await ai.models.generateContent({
            model: modelId,
            contents: {
                parts: [
                    { inlineData: { mimeType: actualMimeType, data: base64Data } },
                    { text: "Detect vehicles/pedestrians. Return 2D bounding boxes and congestion level." }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: fastAnalysisSchema,
                temperature: 0.1, // Deterministic
            }
        });

        if (!response.text) throw new Error("No response");
        const data = JSON.parse(cleanJsonString(response.text));
        
        if (data.detections) data.detections = applyNMS(data.detections, 0.4);

        // Construct a partial FullAnalysisResult
        return {
            timestamp: Date.now(),
            detections: data.detections,
            analysis: {
                congestionLevel: data.congestionLevel,
                trafficFlowStatus: data.trafficFlowStatus,
                totalVehicles: data.detections.filter((d: any) => d.type === 'vehicle').length,
                pedestrianCount: data.detections.filter((d: any) => d.type === 'pedestrian').length,
                trafficLights: [],
                estimatedAverageSpeed: 0,
                detectedViolations: []
            },
            report: {
                summary: "Real-time monitoring active.",
                recommendations: [],
                priorityScore: 1
            }
        };

    } catch (error) {
        handleGeminiError(error);
        return {};
    }
};

/**
 * Full Analysis for Snapshots or Periodic Checks
 * Automatically detects scene type and adapts analysis parameters.
 */
export const analyzeTrafficImage = async (base64Image: string, mimeType: string): Promise<FullAnalysisResult> => {
  const modelId = "gemini-2.5-flash"; 

  try {
        // Pass mimeType to optimizer
        const optimizedImage = await optimizeBase64Image(base64Image, 1024, mimeType);
        
        // FIX: Extract the ACTUAL mime type and data from the optimized result.
        // optimizeBase64Image might convert the format (e.g. BMP -> JPEG), so we must trust its output header.
        const match = optimizedImage.match(/^data:(.*);base64,(.*)$/);
        const actualMimeType = match ? match[1] : mimeType;
        const base64Data = match ? match[2] : optimizedImage.split(',')[1];

        // Updated system instruction to be scene-aware
        const systemInstruction = `
          You are the 'Multi AI Agent' Traffic Monitoring System.
          
          PHASE 1: SCENE IDENTIFICATION
          Classify the image into one of these types: 'Highway', 'Intersection', 'City Street', 'Parking Lot', 'Tunnel', or 'Other'.
          
          PHASE 2: CONTEXT-AWARE ANALYSIS
          Adjust your analysis based on the identified scene:
          - Highway: Focus on flow efficiency, lane discipline, and hard shoulder violations. Speed assumption: High.
          - Intersection: Focus on traffic signal compliance, stop lines, and turning conflicts.
          - City Street: High alert for pedestrians, cyclists, and illegal parking. Speed assumption: Low/Moderate.
          - Tunnel: Critical alert for stopped vehicles or lane changes.
          
          PHASE 3: DETECTION & REPORTING
          - Detect objects (Car, Truck, Bus, Bike, Person) with [ymin, xmin, ymax, xmax] boxes (0-1000).
          - Analyze congestion level (0-100) and flow status.
          - List specific violations with severity based on the scene context.
        `;

        const response = await ai.models.generateContent({
          model: modelId,
          contents: {
            parts: [
              { inlineData: { mimeType: actualMimeType, data: base64Data } },
              { text: "Analyze traffic scene. Identify scene type and detect issues." }
            ]
          },
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: fullAnalysisSchema,
          }
        });

        const data = JSON.parse(cleanJsonString(response.text)) as FullAnalysisResult;
        
        if (data.detections) data.detections = applyNMS(data.detections, 0.45);
        
        data.timestamp = Date.now();
        return data;

    } catch (error) {
        handleGeminiError(error);
        throw error;
    }
};

export const getLocationContext = async (lat: number, lng: number): Promise<LocationContextData> => {
    // Keep existing logic
    const modelId = "gemini-2.5-flash";
    try {
        const prompt = `Identify location from ${lat},${lng}. List nearby traffic influencers.`;
        const response = await ai.models.generateContent({
            model: modelId,
            contents: { text: prompt },
            config: {
                tools: [{ googleMaps: {} }],
                toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } }
            }
        });
        const text = response.text || "No context.";
        return {
            latitude: lat,
            longitude: lng,
            address: "Detected via Google Maps",
            nearbyPlaces: [],
            trafficInfluencers: [text] 
        };
    } catch (error) {
        return { latitude: lat, longitude: lng, address: "Unavailable", nearbyPlaces: [], trafficInfluencers: ["Map Service Error"] };
    }
};