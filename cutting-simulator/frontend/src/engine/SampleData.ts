import type { ToolDefinition, BBox } from '../types';
import {
  targetTopZ,
  bladeAngle,
  NUM_BLADES, HUB_R, BLADE_OUTER_R, BLADE_THICKNESS,
  BLADE_HEIGHT, HUB_DOME_HEIGHT,
} from './TargetShape';

// === Default Tools ===
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
  minX: -35, maxX: 35,
  minY: -35, maxY: 35,
  minZ: -5, maxZ: 25,
};

// =====================================================================
//  Height map + dilation for tool-compensated toolpath generation
// =====================================================================

const MAP_CS = 0.5;
const MAP_NX = Math.ceil((defaultStock.maxX - defaultStock.minX) / MAP_CS);
const MAP_NY = Math.ceil((defaultStock.maxY - defaultStock.minY) / MAP_CS);
const MAP_OX = defaultStock.minX;
const MAP_OY = defaultStock.minY;

function buildHeightMap(): Float32Array {
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

/** Morphological max-dilation: each cell = max within radius */
function dilateMap(map: Float32Array, radius: number): Float32Array {
  const dilated = new Float32Array(MAP_NX * MAP_NY);
  const cells = Math.ceil(radius / MAP_CS);
  const r2 = (radius / MAP_CS) * (radius / MAP_CS);

  for (let iy = 0; iy < MAP_NY; iy++) {
    for (let ix = 0; ix < MAP_NX; ix++) {
      let maxZ = -200;
      for (let dy = -cells; dy <= cells; dy++) {
        const jy = iy + dy;
        if (jy < 0 || jy >= MAP_NY) continue;
        for (let dx = -cells; dx <= cells; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const jx = ix + dx;
          if (jx < 0 || jx >= MAP_NX) continue;
          const v = map[jy * MAP_NX + jx];
          if (v > maxZ) maxZ = v;
        }
      }
      dilated[iy * MAP_NX + ix] = maxZ;
    }
  }
  return dilated;
}

function lookupZ(map: Float32Array, x: number, y: number): number {
  const ix = Math.floor((x - MAP_OX) / MAP_CS);
  const iy = Math.floor((y - MAP_OY) / MAP_CS);
  if (ix < 0 || ix >= MAP_NX || iy < 0 || iy >= MAP_NY) return -200;
  return map[iy * MAP_NX + ix];
}

/**
 * Find X segments where dilated target < cutting Z (safe to cut).
 */
function findCuttableSegments(
  dMap: Float32Array, y: number, cz: number,
  xMin: number, xMax: number, minLen: number
): [number, number][] {
  const segs: [number, number][] = [];
  const step = MAP_CS;
  let segStart: number | null = null;
  const n = Math.ceil((xMax - xMin) / step);

  for (let i = 0; i <= n; i++) {
    const x = xMin + i * step;
    const canCut = lookupZ(dMap, x, y) < cz - 0.1;

    if (canCut && segStart === null) {
      segStart = x;
    } else if (!canCut && segStart !== null) {
      const end = xMin + (i - 1) * step;
      if (end - segStart >= minLen) segs.push([segStart, end]);
      segStart = null;
    }
  }
  if (segStart !== null) {
    const end = xMin + n * step;
    if (end - segStart >= minLen) segs.push([segStart, end]);
  }
  return segs;
}

// =====================================================================
//  G-code generation
// =====================================================================

export function getDefaultGCode(): string {
  const rawMap = buildHeightMap();

  const TR1 = 5;   // T1 radius
  const TR3 = 4;   // T3 radius
  const roughDilated = dilateMap(rawMap, TR1 + 0.5);
  const semiDilated = dilateMap(rawMap, TR3 + 0.3);

  const L: string[] = [];
  const SZ = 30;

  L.push('(=== Impeller 5-Axis Machining ===)');
  L.push('G90 G21');
  L.push('');

  // Phase 1: Roughing — T1 φ10 Flat
  L.push('(===== Phase 1: Roughing T1 φ10 Flat =====)');
  L.push('T1 M6');
  L.push('M3 S10000');
  L.push(`G0 Z${SZ}`);

  const STEP1 = 4;
  const roughLayers = [24, 22, 20, 17, 14, 11, 8, 5, 2, 0, -2];

  for (const cz of roughLayers) {
    let fwd = true;
    for (let y = -BLADE_OUTER_R; y <= BLADE_OUTER_R; y += STEP1) {
      const xLim = BLADE_OUTER_R + 2;
      const segs = findCuttableSegments(roughDilated, y, cz, -xLim, xLim, 3);
      for (const [sx, ex] of segs) {
        lineCut(L, fwd ? sx : ex, y, cz, fwd ? ex : sx, y, cz, SZ);
      }
      fwd = !fwd;
    }
  }

  // Phase 2: Semi-finish — T3 φ8 R1 Bull Nose
  L.push('');
  L.push('(===== Phase 2: Semi-finish T3 φ8R1 =====)');
  L.push('T3 M6');
  L.push('M3 S14000');
  L.push(`G0 Z${SZ}`);

  // Hub contour — trace arcs between blades (skip blade sectors)
  const TOOL3_R = 4; // T3 radius
  for (let z = 20; z >= 0; z -= 2) {
    const contourR = HUB_R + 1;
    bladeAvoidArcs(L, contourR, z, SZ, TOOL3_R, 200, 800);
  }
  // Hub dome — arcs inside hub radius (safe from blades)
  for (let r = 2; r <= HUB_R - 1; r += 1.5) {
    const dz = BLADE_HEIGHT + HUB_DOME_HEIGHT * Math.sqrt(Math.max(0, 1 - (r / HUB_R) ** 2));
    circle(L, r, dz, SZ, 150, 800);
  }
  // Channel cleanup (finer zigzag)
  const STEP3 = 2.5;
  const semiLayers = [18, 14, 10, 6, 2, -1, -3];
  for (const cz of semiLayers) {
    let fwd = true;
    for (let y = -BLADE_OUTER_R; y <= BLADE_OUTER_R; y += STEP3) {
      const xLim = BLADE_OUTER_R + 1;
      const segs = findCuttableSegments(semiDilated, y, cz, -xLim, xLim, 2);
      for (const [sx, ex] of segs) {
        lineCut(L, fwd ? sx : ex, y, cz, fwd ? ex : sx, y, cz, SZ, 200, 1000);
      }
      fwd = !fwd;
    }
  }

  // Phase 3: 5-axis finish — T2 φ6 Ball
  L.push('');
  L.push('(===== Phase 3: 5-Axis Finish T2 φ6 Ball =====)');
  L.push('T2 M6');
  L.push('M3 S18000');
  L.push(`G0 Z${SZ}`);

  const BALL_R = 3; // T2 ball endmill radius
  const BALL_FLUTE = 20; // T2 flute length
  for (let b = 0; b < NUM_BLADES; b++) {
    for (const side of [-1, 1]) {
      for (let z = 0; z <= BLADE_HEIGHT; z += 1.5) {
        const pts: { x: number; y: number; z: number; a: number; b: number }[] = [];
        for (let r = HUB_R + 1; r <= BLADE_OUTER_R - 1; r += 1.0) {
          const ba = bladeAngle(b, r, z);
          const halfW = BLADE_THICKNESS / (2 * r);

          // Account for blade twist: tool body extends from z to z+fluteLength.
          // The blade rotates with Z. For side=+1, blade at higher Z moves toward tool.
          // Compute max blade angle shift across the flute height to add extra offset.
          let maxTwistShift = 0;
          const topZ = Math.min(z + BALL_FLUTE, BLADE_HEIGHT);
          for (let zc = z; zc <= topZ; zc += 1.0) {
            const shift = Math.abs(bladeAngle(b, r, zc) - ba);
            if (shift > maxTwistShift) maxTwistShift = shift;
          }

          // For side=+1: blade twists TOWARD tool → need extra offset
          // For side=-1: blade twists AWAY → standard offset is enough
          const twistExtra = side === 1 ? maxTwistShift : 0;
          const sa = ba + side * (halfW + (BALL_R + 0.5) / r + twistExtra);
          const tilt = side * 15;
          const na = sa + side * Math.PI / 2;
          pts.push({
            x: r * Math.cos(sa), y: r * Math.sin(sa), z,
            a: tilt * Math.cos(na), b: tilt * Math.sin(na),
          });
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

  // Hub dome 5-axis
  for (let r = 1; r <= HUB_R - 0.5; r += 0.8) {
    const dz = BLADE_HEIGHT + HUB_DOME_HEIGHT * Math.sqrt(Math.max(0, 1 - (r / HUB_R) ** 2));
    const tilt = (r / HUB_R) * 25;
    const nSteps = Math.max(16, Math.ceil(2 * Math.PI * r));
    for (let s = 0; s <= nSteps; s++) {
      const ang = (s / nSteps) * 2 * Math.PI;
      const px = r * Math.cos(ang), py = r * Math.sin(ang);
      const a = tilt * Math.sin(ang), bv = -tilt * Math.cos(ang);
      if (s === 0) {
        L.push(`G0 X${px.toFixed(2)} Y${py.toFixed(2)}`);
        L.push(`G1 Z${dz.toFixed(2)} A${a.toFixed(2)} B${bv.toFixed(2)} F150`);
      } else {
        L.push(`G1 X${px.toFixed(2)} Y${py.toFixed(2)} Z${dz.toFixed(2)} A${a.toFixed(2)} B${bv.toFixed(2)} F500`);
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

// =============== Helpers ===============

function lineCut(
  L: string[], x0: number, y0: number, z0: number,
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
 * Trace arcs around hub at radius contourR, skipping blade sectors.
 * Each blade sector is ±(halfBladeWidth + toolRadius) around blade center.
 */
function bladeAvoidArcs(
  L: string[], contourR: number, z: number,
  safeZ: number, toolR: number, plungeF: number, cutF: number
): void {
  const nSteps = 180;
  const halfExclude = (BLADE_THICKNESS / 2 + toolR + 1) / contourR; // angular exclusion per blade

  for (let s = 0; s <= nSteps; s++) {
    const ang = (s / nSteps) * 2 * Math.PI;

    // Check if this angle is inside any blade exclusion zone
    let inBlade = false;
    for (let b = 0; b < NUM_BLADES; b++) {
      const ba = bladeAngle(b, contourR, z);
      let diff = ang - ba;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) < halfExclude) { inBlade = true; break; }
    }

    if (inBlade) {
      // Retract if we were cutting
      if (s > 0) L.push(`G0 Z${safeZ}`);
      continue;
    }

    const px = contourR * Math.cos(ang);
    const py = contourR * Math.sin(ang);
    // Check if previous point was also valid (i.e., we're continuing an arc)
    const prevAng = ((s - 1) / nSteps) * 2 * Math.PI;
    let prevInBlade = s === 0;
    if (!prevInBlade) {
      for (let b = 0; b < NUM_BLADES; b++) {
        const ba = bladeAngle(b, contourR, z);
        let diff = prevAng - ba;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        if (Math.abs(diff) < halfExclude) { prevInBlade = true; break; }
      }
    }

    if (prevInBlade || s === 0) {
      // Start a new arc segment
      L.push(`G0 X${px.toFixed(2)} Y${py.toFixed(2)}`);
      L.push(`G1 Z${z.toFixed(1)} F${plungeF}`);
    } else {
      L.push(`G1 X${px.toFixed(2)} Y${py.toFixed(2)} F${cutF}`);
    }
  }
  L.push(`G0 Z${safeZ}`);
}

// Keep for backward compat
export function getDomeTargetHeight(
  cx: number, cy: number, radius: number,
  baseZ: number, topZ: number
): (x: number, y: number) => number {
  return (x: number, y: number) => {
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (dist >= radius) return baseZ;
    const t = 1 - (dist / radius);
    return baseZ + (topZ - baseZ) * Math.sqrt(t);
  };
}
