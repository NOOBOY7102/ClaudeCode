// === Tool Types ===
export type ToolType = 'flat' | 'ball' | 'bull_nose';

export interface ToolDefinition {
  id: string;
  name: string;
  type: ToolType;
  diameter: number;       // mm
  cornerRadius: number;   // mm (ball: diameter/2, flat: 0)
  fluteLength: number;    // mm
  shankDiameter: number;  // mm
  totalLength: number;    // mm
}

// === Toolpath Types ===
export type MotionType = 'rapid' | 'linear' | 'arc_cw' | 'arc_ccw';

export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedRate: number;    // mm/min
  type: MotionType;
}

export interface ToolpathSegment {
  toolId: string;
  points: ToolpathPoint[];
  label: string;
}

// === Dexel Types ===
export interface DexelGrid {
  nx: number;
  ny: number;
  originX: number;
  originY: number;
  originZ: number;
  cellSize: number;
  // Each cell stores pairs of [start, end] segments
  // Flat array: segments[cellIndex] = Float32Array of [s0,e0, s1,e1, ...]
  segments: Float32Array[];
}

// === Simulation State ===
export type SimState = 'idle' | 'playing' | 'paused' | 'finished';

export interface SimulationProgress {
  currentSegmentIndex: number;
  currentPointIndex: number;
  totalPoints: number;
  elapsedTime: number;      // seconds (simulated)
  materialRemoved: number;  // percentage
}

// === Bounding Box ===
export interface BBox {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}
