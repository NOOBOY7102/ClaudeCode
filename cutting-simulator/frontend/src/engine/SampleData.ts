import type { ToolDefinition, BBox } from '../types';

// === Default Tools (5-axis impeller machining) ===
export const defaultTools: ToolDefinition[] = [
  {
    id: 'T1',
    name: 'φ10 Flat End Mill',
    type: 'flat',
    diameter: 10,
    cornerRadius: 0,
    fluteLength: 25,
    shankDiameter: 10,
    totalLength: 75,
  },
  {
    id: 'T2',
    name: 'φ6 Ball End Mill',
    type: 'ball',
    diameter: 6,
    cornerRadius: 3,
    fluteLength: 20,
    shankDiameter: 6,
    totalLength: 60,
  },
  {
    id: 'T3',
    name: 'φ8 R1 Bull Nose',
    type: 'bull_nose',
    diameter: 8,
    cornerRadius: 1,
    fluteLength: 22,
    shankDiameter: 8,
    totalLength: 65,
  },
];

// === Default Stock ===
export const defaultStock: BBox = {
  minX: -35,
  maxX: 35,
  minY: -35,
  maxY: 35,
  minZ: -5,
  maxZ: 25,
};

// =====================================================================
//  Impeller target shape definition
// =====================================================================

const NUM_BLADES = 5;
const HUB_R = 8;
const BLADE_OUTER_R = 30;
const BLADE_THICKNESS = 2.5;
const BLADE_HEIGHT = 20; // Z=0 to Z=20
const BLADE_TWIST = 25;  // degrees twist from root to tip
const FLOOR_Z = -3;      // channel floor between blades
const HUB_DOME_HEIGHT = 3; // dome rises 3mm above blade top

/** Blade center angle at given radius and Z height (twisted blade) */
function bladeAngle(bladeIdx: number, r: number, z: number): number {
  const baseAngle = (bladeIdx / NUM_BLADES) * 2 * Math.PI;
  const twistRad = (BLADE_TWIST * Math.PI / 180);
  const rFrac = Math.max(0, (r - HUB_R) / (BLADE_OUTER_R - HUB_R));
  const zFrac = Math.max(0, Math.min(z, BLADE_HEIGHT)) / BLADE_HEIGHT;
  return baseAngle + twistRad * rFrac * zFrac;
}

/** Check if point (x,y) at height z is inside any blade */
function isInsideBlade(x: number, y: number, z: number): boolean {
  if (z < 0 || z > BLADE_HEIGHT) return false;
  const r = Math.sqrt(x * x + y * y);
  if (r < HUB_R || r > BLADE_OUTER_R) return false;
  const pointAngle = Math.atan2(y, x);

  for (let b = 0; b < NUM_BLADES; b++) {
    const ba = bladeAngle(b, r, z);
    let diff = pointAngle - ba;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const halfW = BLADE_THICKNESS / (2 * r);
    if (Math.abs(diff) < halfW) return true;
  }
  return false;
}

// =====================================================================
//  Target shape as a height map
//
//  targetTopZ(x, y) returns the maximum Z height of part material
//  at position (x,y). This defines the finished impeller shape:
//    - Hub dome: Z = 20 + dome
//    - Blade cells: Z = max Z where blade exists at (x,y)
//    - Channel cells: Z = FLOOR_Z (between blades)
//    - Outside impeller: Z = stock bottom
// =====================================================================

function targetTopZ(x: number, y: number): number {
  const r = Math.sqrt(x * x + y * y);

  // Outside impeller → stock bottom (will be cut away)
  if (r > BLADE_OUTER_R + 0.5) return defaultStock.minZ;

  // Inside hub → dome
  if (r <= HUB_R) {
    const rFrac = r / HUB_R;
    return BLADE_HEIGHT + HUB_DOME_HEIGHT * Math.sqrt(Math.max(0, 1 - rFrac * rFrac));
  }

  // Between hub and outer radius: search for blade at (x,y)
  // Find the highest Z where the blade exists
  for (let z = BLADE_HEIGHT; z >= 0; z -= 0.5) {
    if (isInsideBlade(x, y, z)) {
      return z;
    }
  }

  // In channel between blades → floor
  return FLOOR_Z;
}

// =====================================================================
//  Height map computation and dilation (tool radius compensation)
// =====================================================================

const MAP_CS = 0.5;  // cell size (matches dexel resolution)
const MAP_NX = Math.ceil((defaultStock.maxX - defaultStock.minX) / MAP_CS);
const MAP_NY = Math.ceil((defaultStock.maxY - defaultStock.minY) / MAP_CS);
const MAP_OX = defaultStock.minX;
const MAP_OY = defaultStock.minY;

function buildTargetMap(): Float32Array {
  const map = new Float32Array(MAP_NX * MAP_NY);
  for (let iy = 0; iy < MAP_NY; iy++) {
    for (let ix = 0; ix < MAP_NX; ix++) {
      const x = MAP_OX + (ix + 0.5) * MAP_CS;
      const y = MAP_OY + (iy + 0.5) * MAP_CS;
      map[iy * MAP_NX + ix] = targetTopZ(x, y);
    }
  }
  return map;
}

/** Morphological dilation: each cell gets the max of its neighborhood */
function dilateMap(map: Float32Array, radius: number): Float32Array {
  const dilated = new Float32Array(MAP_NX * MAP_NY);
  const cells = Math.ceil(radius / MAP_CS);
  const r2 = cells * cells;

  for (let iy = 0; iy < MAP_NY; iy++) {
    for (let ix = 0; ix < MAP_NX; ix++) {
      let maxZ = -100;
      for (let dy = -cells; dy <= cells; dy++) {
        for (let dx = -cells; dx <= cells; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const jx = ix + dx;
          const jy = iy + dy;
          if (jx >= 0 && jx < MAP_NX && jy >= 0 && jy < MAP_NY) {
            const v = map[jy * MAP_NX + jx];
            if (v > maxZ) maxZ = v;
          }
        }
      }
      dilated[iy * MAP_NX + ix] = maxZ;
    }
  }
  return dilated;
}

/** Look up dilated target Z at world coordinates */
function lookupZ(map: Float32Array, x: number, y: number): number {
  const ix = Math.floor((x - MAP_OX) / MAP_CS);
  const iy = Math.floor((y - MAP_OY) / MAP_CS);
  if (ix < 0 || ix >= MAP_NX || iy < 0 || iy >= MAP_NY) return -100;
  return map[iy * MAP_NX + ix];
}

// =====================================================================
//  G-code generation: toolpaths from stock → target shape
// =====================================================================

export function getDefaultGCode(): string {
  // Precompute target height maps with tool radius compensation
  const rawMap = buildTargetMap();

  const TR1 = 5;  // T1 tool radius
  const TR3 = 4;  // T3 tool radius
  const ROUGH_ALLOW = 0.5;  // finishing stock allowance
  const SEMI_ALLOW = 0.2;

  const roughMap = dilateMap(rawMap, TR1 + ROUGH_ALLOW);
  const semiMap = dilateMap(rawMap, TR3 + SEMI_ALLOW);

  const L: string[] = [];
  const SZ = 30;

  L.push('(=== Impeller 5-Axis Machining Demo ===)');
  L.push('(Target-shape-based toolpath generation)');
  L.push('G90 G21');
  L.push('');

  // ==========================================================
  //  Phase 1: ROUGHING — T1 φ10 Flat End Mill (3-axis)
  //  Cut where dilated target height < current Z layer
  // ==========================================================
  L.push('(===== Phase 1: Roughing - T1 Flat φ10 =====)');
  L.push('T1 M6');
  L.push('M3 S10000');
  L.push(`G0 Z${SZ}`);

  const STEP1 = 5;  // zigzag line spacing
  const MIN_SEG = 3; // minimum segment length to cut

  // Layer-by-layer from top down
  const roughLayers = [24, 22, 20, 17, 14, 11, 8, 5, 2, 0, -2];

  for (const cz of roughLayers) {
    L.push(`(-- Rough layer Z=${cz} --)`);
    let fwd = true;

    for (let y = -BLADE_OUTER_R + 1; y <= BLADE_OUTER_R - 1; y += STEP1) {
      const xLim = Math.sqrt(Math.max(0, BLADE_OUTER_R * BLADE_OUTER_R - y * y));
      if (xLim < TR1) continue;

      // Scan X to find segments where target is below current Z
      const segs = findCuttableSegments(roughMap, y, cz, -xLim, xLim, MIN_SEG);

      for (const [sx, ex] of segs) {
        if (fwd) {
          lineCut(L, sx, y, cz, ex, y, cz, SZ);
        } else {
          lineCut(L, ex, y, cz, sx, y, cz, SZ);
        }
      }
      fwd = !fwd;
    }
  }

  // ==========================================================
  //  Phase 2: SEMI-FINISH — T3 φ8 R1 Bull Nose (3-axis)
  //  Finer passes using semi-finish dilated map
  // ==========================================================
  L.push('');
  L.push('(===== Phase 2: Semi-finish - T3 Bull Nose φ8 R1 =====)');
  L.push('T3 M6');
  L.push('M3 S14000');
  L.push(`G0 Z${SZ}`);

  // Hub contour
  L.push('(-- Hub contour --)');
  for (let z = 20; z >= 0; z -= 2) {
    circle(L, HUB_R + 1, z, SZ, 200, 800);
  }

  // Hub dome
  L.push('(-- Hub dome --)');
  for (let r = 2; r <= HUB_R; r += 1.5) {
    const domeZ = BLADE_HEIGHT + HUB_DOME_HEIGHT * Math.sqrt(Math.max(0, 1 - (r / HUB_R) ** 2));
    circle(L, r, domeZ, SZ, 150, 800);
  }

  // Channel cleanup using semi-finish map (finer zigzag)
  L.push('(-- Channel cleanup --)');
  const STEP3 = 3;
  const semiLayers = [18, 14, 10, 6, 2, -1, -3];

  for (const cz of semiLayers) {
    let fwd = true;
    for (let y = -BLADE_OUTER_R + 1; y <= BLADE_OUTER_R - 1; y += STEP3) {
      const xLim = Math.sqrt(Math.max(0, BLADE_OUTER_R * BLADE_OUTER_R - y * y));
      if (xLim < TR3) continue;

      const segs = findCuttableSegments(semiMap, y, cz, -xLim, xLim, 2);
      for (const [sx, ex] of segs) {
        if (fwd) {
          lineCut(L, sx, y, cz, ex, y, cz, SZ, 200, 1000);
        } else {
          lineCut(L, ex, y, cz, sx, y, cz, SZ, 200, 1000);
        }
      }
      fwd = !fwd;
    }
  }

  // ==========================================================
  //  Phase 3: FINISHING — T2 φ6 Ball End Mill (simultaneous 5-axis)
  // ==========================================================
  L.push('');
  L.push('(===== Phase 3: 5-Axis Finishing - T2 Ball φ6 =====)');
  L.push('T2 M6');
  L.push('M3 S18000');
  L.push(`G0 Z${SZ}`);

  // Blade surface finishing (both sides of each blade)
  const FINISH_STEP_Z = 1.5;
  const FINISH_STEP_R = 1.0;

  for (let b = 0; b < NUM_BLADES; b++) {
    L.push(`(-- Blade ${b + 1} finishing --)`);

    for (const side of [-1, 1]) {
      for (let z = 0; z <= BLADE_HEIGHT; z += FINISH_STEP_Z) {
        const pts: { x: number; y: number; z: number; a: number; b: number }[] = [];

        for (let r = HUB_R + 1; r <= BLADE_OUTER_R - 1; r += FINISH_STEP_R) {
          const ba = bladeAngle(b, r, z);
          const halfW = BLADE_THICKNESS / (2 * r);
          const surfAngle = ba + side * halfW;

          const tx = r * Math.cos(surfAngle);
          const ty = r * Math.sin(surfAngle);

          const tiltAngle = side * 15;
          const bladeNormalAngle = surfAngle + side * Math.PI / 2;
          const aAx = tiltAngle * Math.cos(bladeNormalAngle);
          const bAx = tiltAngle * Math.sin(bladeNormalAngle);

          pts.push({ x: tx, y: ty, z: z, a: aAx, b: bAx });
        }

        if (pts.length < 2) continue;

        L.push(`G0 X${pts[0].x.toFixed(2)} Y${pts[0].y.toFixed(2)}`);
        L.push(`G0 Z${(pts[0].z + 3).toFixed(1)}`);
        L.push(`G1 Z${pts[0].z.toFixed(2)} A${pts[0].a.toFixed(2)} B${pts[0].b.toFixed(2)} F150`);

        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          L.push(`G1 X${p.x.toFixed(2)} Y${p.y.toFixed(2)} Z${p.z.toFixed(2)} A${p.a.toFixed(2)} B${p.b.toFixed(2)} F500`);
        }
        L.push(`G0 Z${SZ}`);
      }
    }
  }

  // Hub dome 5-axis finishing
  L.push('(-- Hub dome 5-axis finishing --)');
  for (let r = 1; r <= HUB_R - 0.5; r += 0.8) {
    const domeZ = BLADE_HEIGHT + HUB_DOME_HEIGHT * Math.sqrt(Math.max(0, 1 - (r / HUB_R) ** 2));
    const tiltDeg = (r / HUB_R) * 25;
    const nSteps = Math.max(16, Math.ceil(2 * Math.PI * r / 1.0));

    for (let s = 0; s <= nSteps; s++) {
      const angle = (s / nSteps) * 2 * Math.PI;
      const px = r * Math.cos(angle);
      const py = r * Math.sin(angle);
      const aAx = tiltDeg * Math.sin(angle);
      const bAx = -tiltDeg * Math.cos(angle);

      if (s === 0) {
        L.push(`G0 X${px.toFixed(2)} Y${py.toFixed(2)}`);
        L.push(`G1 Z${domeZ.toFixed(2)} A${aAx.toFixed(2)} B${bAx.toFixed(2)} F150`);
      } else {
        L.push(`G1 X${px.toFixed(2)} Y${py.toFixed(2)} Z${domeZ.toFixed(2)} A${aAx.toFixed(2)} B${bAx.toFixed(2)} F500`);
      }
    }
    L.push(`G0 Z${SZ}`);
  }

  L.push('');
  L.push('G0 Z50 A0 B0');
  L.push('M5');
  L.push('M30');

  return L.join('\n');
}

// =====================================================================
//  Toolpath helpers
// =====================================================================

/**
 * Find X-axis segments where dilated target Z < cutting Z.
 * Returns [xStart, xEnd] pairs suitable for cutting.
 */
function findCuttableSegments(
  dilatedMap: Float32Array,
  y: number, cz: number,
  xMin: number, xMax: number,
  minLength: number
): [number, number][] {
  const segments: [number, number][] = [];
  const step = 0.5;
  let segStart: number | null = null;
  const n = Math.ceil((xMax - xMin) / step);

  for (let i = 0; i <= n; i++) {
    const x = xMin + i * step;
    const targetZ = lookupZ(dilatedMap, x, y);
    const canCut = targetZ < cz - 0.1;  // target is below current Z → cut

    if (canCut && segStart === null) {
      segStart = x;
    } else if (!canCut && segStart !== null) {
      const end = xMin + (i - 1) * step;
      if (end - segStart >= minLength) {
        segments.push([segStart, end]);
      }
      segStart = null;
    }
  }
  if (segStart !== null) {
    const end = xMin + n * step;
    if (end - segStart >= minLength) {
      segments.push([segStart, end]);
    }
  }
  return segments;
}

function lineCut(
  L: string[],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  safeZ: number, plungeF = 300, cutF = 2000
): void {
  L.push(`G0 X${x0.toFixed(1)} Y${y0.toFixed(1)}`);
  L.push(`G0 Z${(z0 + 2).toFixed(1)}`);
  L.push(`G1 Z${z0.toFixed(1)} F${plungeF}`);
  if (Math.abs(z1 - z0) > 0.01) {
    L.push(`G1 X${x1.toFixed(1)} Y${y1.toFixed(1)} Z${z1.toFixed(1)} F${cutF}`);
  } else {
    L.push(`G1 X${x1.toFixed(1)} Y${y1.toFixed(1)} F${cutF}`);
  }
  L.push(`G0 Z${safeZ}`);
}

function circle(
  L: string[], r: number, z: number,
  safeZ: number, plungeF: number, cutF: number
): void {
  L.push(`G0 X${r.toFixed(1)} Y0`);
  L.push(`G1 Z${z.toFixed(1)} F${plungeF}`);
  L.push(`G2 X${r.toFixed(1)} Y0 I${(-r).toFixed(1)} J0 F${cutF}`);
  L.push(`G0 Z${safeZ}`);
}

/**
 * Export target height function for potential visualization / difference map
 */
export function getTargetTopZ(x: number, y: number): number {
  return targetTopZ(x, y);
}

/**
 * Generate vertices for dome target shape (for difference comparison)
 */
export function getDomeTargetHeight(
  cx: number, cy: number, radius: number,
  baseZ: number, topZ: number
): (x: number, y: number) => number {
  void isInsideBlade;
  return (x: number, y: number) => {
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (dist >= radius) return baseZ;
    const t = 1 - (dist / radius);
    return baseZ + (topZ - baseZ) * Math.sqrt(t);
  };
}
