import type { ToolpathPoint, ToolpathSegment, MotionType } from '../types';

interface GCodeState {
  motionMode: MotionType;
  x: number;
  y: number;
  z: number;
  a: number; // A-axis (tilt around X, degrees)
  b: number; // B-axis (tilt around Y, degrees)
  feedRate: number;
  currentTool: string;
  isAbsolute: boolean;
  is5axis: boolean; // true once A or B word is seen
}

interface ParsedLine {
  words: Map<string, number>;
  comment?: string;
}

/** Convert A/B angles (degrees) to tool axis unit vector (i,j,k) */
function abToAxisVector(aDeg: number, bDeg: number): [number, number, number] {
  // A = rotation around X-axis, B = rotation around Y-axis
  // Tool axis starts as (0,0,1) and is rotated by B then A
  const ar = aDeg * Math.PI / 180;
  const br = bDeg * Math.PI / 180;
  const sinA = Math.sin(ar), cosA = Math.cos(ar);
  const sinB = Math.sin(br), cosB = Math.cos(br);
  // Rz after Ry(B) then Rx(A): (sinB, -sinA*cosB, cosA*cosB)
  return [sinB, -sinA * cosB, cosA * cosB];
}

/**
 * Parse G-code text into toolpath segments.
 * Supports: G0, G1, G2, G3, G90, G91, T, M6, F, S, A, B (5-axis)
 */
export function parseGCode(text: string, toolIds?: string[]): ToolpathSegment[] {
  const lines = text.split('\n');
  const segments: ToolpathSegment[] = [];

  const state: GCodeState = {
    motionMode: 'rapid',
    x: 0, y: 0, z: 0,
    a: 0, b: 0,
    feedRate: 1000,
    currentTool: toolIds?.[0] ?? 'T1',
    isAbsolute: true,
    is5axis: false,
  };

  let currentPoints: ToolpathPoint[] = [];
  let segmentLabel = 'Operation 1';
  let opCount = 1;

  function flushSegment() {
    if (currentPoints.length > 0) {
      segments.push({
        toolId: state.currentTool,
        points: currentPoints,
        label: segmentLabel,
      });
      currentPoints = [];
    }
  }

  for (const rawLine of lines) {
    const parsed = parseLine(rawLine);
    if (!parsed) continue;

    const words = parsed.words;

    // Tool change
    if (words.has('T')) {
      const toolNum = Math.round(words.get('T')!);
      const newTool = toolIds?.[toolNum - 1] ?? `T${toolNum}`;
      if (newTool !== state.currentTool) {
        flushSegment();
        state.currentTool = newTool;
        opCount++;
        segmentLabel = `Operation ${opCount}`;
      }
    }

    // Coordinate mode
    if (words.has('G')) {
      const g = words.get('G')!;
      if (g === 90) state.isAbsolute = true;
      if (g === 91) state.isAbsolute = false;
      if (g === 0) state.motionMode = 'rapid';
      if (g === 1) state.motionMode = 'linear';
      if (g === 2) state.motionMode = 'arc_cw';
      if (g === 3) state.motionMode = 'arc_ccw';
    }

    // Feed rate
    if (words.has('F')) {
      state.feedRate = words.get('F')!;
    }

    // A/B axis (5-axis)
    if (words.has('A')) {
      state.a = state.isAbsolute ? words.get('A')! : state.a + words.get('A')!;
      state.is5axis = true;
    }
    if (words.has('B')) {
      state.b = state.isAbsolute ? words.get('B')! : state.b + words.get('B')!;
      state.is5axis = true;
    }

    // Motion
    if (words.has('X') || words.has('Y') || words.has('Z') ||
        words.has('A') || words.has('B')) {
      let nx = state.x, ny = state.y, nz = state.z;

      if (state.isAbsolute) {
        if (words.has('X')) nx = words.get('X')!;
        if (words.has('Y')) ny = words.get('Y')!;
        if (words.has('Z')) nz = words.get('Z')!;
      } else {
        if (words.has('X')) nx += words.get('X')!;
        if (words.has('Y')) ny += words.get('Y')!;
        if (words.has('Z')) nz += words.get('Z')!;
      }

      // Handle arc interpolation as line segments
      if (state.motionMode === 'arc_cw' || state.motionMode === 'arc_ccw') {
        const arcPoints = interpolateArc(
          state.x, state.y, state.z,
          nx, ny, nz,
          words.get('I') ?? 0,
          words.get('J') ?? 0,
          words.get('K') ?? 0,
          state.motionMode === 'arc_cw',
          state.feedRate,
          state.is5axis ? state.a : undefined,
          state.is5axis ? state.b : undefined
        );
        currentPoints.push(...arcPoints);
      } else {
        const pt: ToolpathPoint = {
          x: nx, y: ny, z: nz,
          feedRate: state.motionMode === 'rapid' ? 10000 : state.feedRate,
          type: state.motionMode,
        };
        if (state.is5axis) {
          const [ai, aj, ak] = abToAxisVector(state.a, state.b);
          pt.ai = ai; pt.aj = aj; pt.ak = ak;
        }
        currentPoints.push(pt);
      }

      state.x = nx;
      state.y = ny;
      state.z = nz;
    }
  }

  flushSegment();
  return segments;
}

function parseLine(line: string): ParsedLine | null {
  // Remove comments
  let clean = line.trim();
  let comment: string | undefined;

  const parenIdx = clean.indexOf('(');
  if (parenIdx >= 0) {
    comment = clean.substring(parenIdx);
    clean = clean.substring(0, parenIdx).trim();
  }
  const semiIdx = clean.indexOf(';');
  if (semiIdx >= 0) {
    comment = clean.substring(semiIdx);
    clean = clean.substring(0, semiIdx).trim();
  }

  if (clean.length === 0) return null;

  // Handle multiple G/M codes on same line
  const words = new Map<string, number>();
  const regex = /([A-Z])(-?\d+\.?\d*)/gi;
  let match;

  while ((match = regex.exec(clean)) !== null) {
    const letter = match[1].toUpperCase();
    const value = parseFloat(match[2]);
    words.set(letter, value);
  }

  if (words.size === 0) return null;

  return { words, comment };
}

function interpolateArc(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  i: number, j: number, _k: number,
  clockwise: boolean,
  feedRate: number,
  aDeg?: number,
  bDeg?: number
): ToolpathPoint[] {
  const cx = x0 + i;
  const cy = y0 + j;
  const r = Math.sqrt(i * i + j * j);

  let startAngle = Math.atan2(y0 - cy, x0 - cx);
  let endAngle = Math.atan2(y1 - cy, x1 - cx);

  if (clockwise) {
    if (endAngle >= startAngle) endAngle -= 2 * Math.PI;
  } else {
    if (endAngle <= startAngle) endAngle += 2 * Math.PI;
  }

  const totalAngle = Math.abs(endAngle - startAngle);
  const steps = Math.max(8, Math.ceil(totalAngle / (Math.PI / 18))); // 10° per step
  const points: ToolpathPoint[] = [];

  const has5axis = aDeg !== undefined && bDeg !== undefined;
  let ai: number | undefined, aj: number | undefined, ak: number | undefined;
  if (has5axis) {
    [ai, aj, ak] = abToAxisVector(aDeg!, bDeg!);
  }

  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const angle = startAngle + (endAngle - startAngle) * t;
    const z = z0 + (z1 - z0) * t;

    const pt: ToolpathPoint = {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      z,
      feedRate,
      type: clockwise ? 'arc_cw' : 'arc_ccw',
    };
    if (has5axis) {
      pt.ai = ai; pt.aj = aj; pt.ak = ak;
    }
    points.push(pt);
  }

  return points;
}

/**
 * Generate a simple demo G-code for testing:
 * Zigzag roughing pass over a rectangular area
 */
export function generateDemoGCode(
  stockMinX: number, stockMaxX: number,
  stockMinY: number, stockMaxY: number,
  stockTopZ: number,
  depth: number,
  toolDiameter: number,
  stepover: number,
  layers: number
): string {
  const lines: string[] = [
    '(Demo roughing toolpath)',
    'G90 G21 ; Absolute, mm',
    'G0 Z10 ; Safe height',
    `T1 M6 ; Tool change`,
    'M3 S10000 ; Spindle on',
    'G0 Z10',
  ];

  const step = toolDiameter * stepover;
  const safeZ = stockTopZ + 5;
  const depthPerLayer = depth / layers;

  for (let layer = 1; layer <= layers; layer++) {
    const cutZ = stockTopZ - depthPerLayer * layer;
    let forward = true;

    for (let y = stockMinY; y <= stockMaxY; y += step) {
      const x0 = forward ? stockMinX : stockMaxX;
      const x1 = forward ? stockMaxX : stockMinX;

      lines.push(`G0 X${x0.toFixed(3)} Y${y.toFixed(3)}`);
      lines.push(`G0 Z${(cutZ + 1).toFixed(3)}`);
      lines.push(`G1 Z${cutZ.toFixed(3)} F200`);
      lines.push(`G1 X${x1.toFixed(3)} F1500`);
      lines.push(`G0 Z${safeZ.toFixed(3)}`);

      forward = !forward;
    }
  }

  lines.push('G0 Z20');
  lines.push('M5 ; Spindle off');
  lines.push('M30 ; End');

  return lines.join('\n');
}
