import type { ToolpathPoint, ToolpathSegment, MotionType } from '../types';

interface GCodeState {
  motionMode: MotionType;
  x: number;
  y: number;
  z: number;
  feedRate: number;
  currentTool: string;
  isAbsolute: boolean;
}

interface ParsedLine {
  words: Map<string, number>;
  comment?: string;
}

/**
 * Parse G-code text into toolpath segments.
 * Supports: G0, G1, G2, G3, G90, G91, T, M6, F, S
 */
export function parseGCode(text: string, toolIds?: string[]): ToolpathSegment[] {
  const lines = text.split('\n');
  const segments: ToolpathSegment[] = [];

  const state: GCodeState = {
    motionMode: 'rapid',
    x: 0, y: 0, z: 0,
    feedRate: 1000,
    currentTool: toolIds?.[0] ?? 'T1',
    isAbsolute: true,
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

    // Motion
    if (words.has('X') || words.has('Y') || words.has('Z')) {
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
          state.feedRate
        );
        currentPoints.push(...arcPoints);
      } else {
        currentPoints.push({
          x: nx, y: ny, z: nz,
          feedRate: state.motionMode === 'rapid' ? 10000 : state.feedRate,
          type: state.motionMode,
        });
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
    // For G codes, we process the last one per line
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
  feedRate: number
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

  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const angle = startAngle + (endAngle - startAngle) * t;
    const z = z0 + (z1 - z0) * t;

    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      z,
      feedRate,
      type: clockwise ? 'arc_cw' : 'arc_ccw',
    });
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
  stepover: number, // fraction of tool diameter
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

  // Finishing pass - contour around a dome/pocket shape
  lines.push('(Finishing pass - circular pocket)');
  const cx = (stockMinX + stockMaxX) / 2;
  const cy = (stockMinY + stockMaxY) / 2;
  const maxR = Math.min(stockMaxX - stockMinX, stockMaxY - stockMinY) * 0.35;
  const finishZ = stockTopZ - depth;
  const finishStep = toolDiameter * 0.1; // 10% stepover for finishing

  for (let r = finishStep; r <= maxR; r += finishStep) {
    lines.push(`G0 X${(cx + r).toFixed(3)} Y${cy.toFixed(3)}`);
    lines.push(`G1 Z${finishZ.toFixed(3)} F200`);
    // Full circle with arc
    lines.push(`G2 X${(cx + r).toFixed(3)} Y${cy.toFixed(3)} I${(-r).toFixed(3)} J0 F800`);
    lines.push(`G0 Z${safeZ.toFixed(3)}`);
  }

  lines.push('G0 Z20');
  lines.push('M5 ; Spindle off');
  lines.push('M30 ; End');

  return lines.join('\n');
}
