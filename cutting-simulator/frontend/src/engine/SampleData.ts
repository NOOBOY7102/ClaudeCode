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

// === Default Stock (cylindrical impeller blank, approximated as box) ===
export const defaultStock: BBox = {
  minX: -35,
  maxX: 35,
  minY: -35,
  maxY: 35,
  minZ: -5,
  maxZ: 25,
};

// =====================================================================
//  Impeller 5-axis Machining Demo
//
//  Target shape:
//    - Central hub: cylinder R=8, Z=-3 to Z=22
//    - 5 twisted blades radiating outward, height ~20mm
//    - Blade channels (pockets between blades) are the cut areas
//    - Hub top: dome shape
//
//  Machining strategy:
//    Phase 1: Roughing (3-axis) — T1 φ10 Flat
//      Layer-by-layer zigzag clearing channels, AVOIDING blades and hub
//    Phase 2: Semi-finish (3+2 axis) — T3 φ8 R1 Bull Nose
//      Contour passes on hub and blade root fillets
//    Phase 3: Finishing (simultaneous 5-axis) — T2 φ6 Ball
//      Tool tilts along blade surfaces, following curvature
// =====================================================================

const NUM_BLADES = 5;
const HUB_R = 8;
const BLADE_OUTER_R = 30;
const BLADE_THICKNESS = 2.5;
const BLADE_HEIGHT = 20; // Z=0 to Z=20
const BLADE_TWIST = 35;  // degrees twist from root to tip

/** Get blade center angle at given radius and Z height (twisted blade) */
function bladeAngle(bladeIdx: number, r: number, z: number): number {
  const baseAngle = (bladeIdx / NUM_BLADES) * 2 * Math.PI;
  const twistRad = (BLADE_TWIST * Math.PI / 180);
  const rFrac = Math.max(0, (r - HUB_R) / (BLADE_OUTER_R - HUB_R));
  const zFrac = Math.max(0, Math.min(z, BLADE_HEIGHT)) / BLADE_HEIGHT;
  return baseAngle + twistRad * rFrac * zFrac;
}

/** Check if point (x,y) at height z is inside any blade */
function isInsideBlade(x: number, y: number, z: number): boolean {
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

/**
 * Check if point (x,y,z) is within `clearance` distance of any blade.
 * Used for roughing tool path avoidance: clearance = toolRadius + stockAllowance.
 */
function isNearBlade(x: number, y: number, z: number, clearance: number): boolean {
  // Blades only exist between Z=0 and Z=BLADE_HEIGHT
  if (z < -1 || z > BLADE_HEIGHT + 1) return false;
  const r = Math.sqrt(x * x + y * y);
  if (r < HUB_R - 1 || r > BLADE_OUTER_R + clearance) return false;
  const pointAngle = Math.atan2(y, x);
  const zClamped = Math.max(0, Math.min(z, BLADE_HEIGHT));

  for (let b = 0; b < NUM_BLADES; b++) {
    const ba = bladeAngle(b, r, zClamped);
    let diff = pointAngle - ba;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    // Effective half-width: blade half-thickness + clearance (in angular terms)
    const halfW = (BLADE_THICKNESS / 2 + clearance) / Math.max(r, 1);
    if (Math.abs(diff) < halfW) return true;
  }
  return false;
}

/**
 * Find safe X-axis cutting segments for a given Y line at height Z.
 * Returns array of [xStart, xEnd] pairs that avoid blades and hub.
 */
function findSafeXSegments(
  y: number, z: number, xLim: number,
  toolR: number, bladeClr: number, hubClr: number
): [number, number][] {
  const segments: [number, number][] = [];
  const step = 0.5;
  let segStart: number | null = null;
  const n = Math.ceil(2 * xLim / step);

  for (let i = 0; i <= n; i++) {
    const x = -xLim + i * step;
    const r = Math.sqrt(x * x + y * y);
    const safe = r > hubClr && r < xLim && !isNearBlade(x, y, z, bladeClr);

    if (safe && segStart === null) {
      segStart = x;
    } else if (!safe && segStart !== null) {
      const end = -xLim + (i - 1) * step;
      if (end - segStart >= toolR) {
        segments.push([segStart, end]);
      }
      segStart = null;
    }
  }
  if (segStart !== null) {
    if (xLim - segStart >= toolR) {
      segments.push([segStart, xLim]);
    }
  }
  return segments;
}

export function getDefaultGCode(): string {
  const L: string[] = [];
  const SZ = 30;

  L.push('(=== Impeller 5-Axis Machining Demo ===)');
  L.push('(5 blades, twisted, simultaneous 5-axis finishing)');
  L.push('G90 G21');
  L.push('');

  // ==========================================================
  //  Phase 1: ROUGHING — T1 φ10 Flat End Mill (3-axis)
  //  Zigzag with blade avoidance: breaks each line into segments
  //  that skip blade+hub regions
  // ==========================================================
  L.push('(===== Phase 1: Roughing - T1 Flat φ10 =====)');
  L.push('T1 M6');
  L.push('M3 S10000');
  L.push(`G0 Z${SZ}`);

  const TR1 = 5; // tool radius
  const STEP1 = 5; // zigzag line spacing
  const BLADE_CLR_ROUGH = TR1 + 1; // blade clearance = tool radius + stock allowance
  const HUB_CLR = HUB_R + TR1 + 1.5; // hub clearance

  // --- Upper layers: above blade region (Z > BLADE_HEIGHT) ---
  // No blade avoidance needed here, just avoid hub
  for (const cz of [24, 22, 20]) {
    L.push(`(-- Rough layer Z=${cz} --)`);
    let fwd = true;
    for (let y = -BLADE_OUTER_R + 1; y <= BLADE_OUTER_R - 1; y += STEP1) {
      const xMax = Math.sqrt(Math.max(0, BLADE_OUTER_R * BLADE_OUTER_R - y * y)) - 1;
      if (xMax < TR1) continue;

      if (y * y < HUB_CLR * HUB_CLR) {
        const xHub = Math.sqrt(Math.max(0, HUB_CLR * HUB_CLR - y * y));
        if (xHub < xMax - TR1) {
          lineCut(L, fwd ? -xMax : -xHub, y, cz, fwd ? -xHub : -xMax, y, cz, SZ);
          lineCut(L, fwd ? xHub : xMax, y, cz, fwd ? xMax : xHub, y, cz, SZ);
        }
      } else {
        lineCut(L, fwd ? -xMax : xMax, y, cz, fwd ? xMax : -xMax, y, cz, SZ);
      }
      fwd = !fwd;
    }
  }

  // --- Blade region layers: Z=18 down to Z=0, with blade avoidance ---
  for (const cz of [18, 15, 12, 9, 6, 3, 0]) {
    L.push(`(-- Rough layer Z=${cz} blade region --)`);
    let fwd = true;
    for (let y = -BLADE_OUTER_R + 1; y <= BLADE_OUTER_R - 1; y += STEP1) {
      const xLim = Math.sqrt(Math.max(0, BLADE_OUTER_R * BLADE_OUTER_R - y * y)) - 1;
      if (xLim < 2) continue;

      const segs = findSafeXSegments(y, cz, xLim, TR1, BLADE_CLR_ROUGH, HUB_CLR);
      for (const [sx, ex] of segs) {
        lineCut(L, fwd ? sx : ex, y, cz, fwd ? ex : sx, y, cz, SZ);
      }
      fwd = !fwd;
    }
  }

  // --- Floor layers: below blade region (Z < 0) ---
  // No blade avoidance needed, just hub avoidance
  for (const cz of [-2, -4]) {
    L.push(`(-- Rough floor Z=${cz} --)`);
    let fwd = true;
    for (let y = -BLADE_OUTER_R + 1; y <= BLADE_OUTER_R - 1; y += STEP1) {
      const xMax = Math.sqrt(Math.max(0, BLADE_OUTER_R * BLADE_OUTER_R - y * y)) - 1;
      if (xMax < TR1) continue;

      if (y * y < HUB_CLR * HUB_CLR) {
        const xHub = Math.sqrt(Math.max(0, HUB_CLR * HUB_CLR - y * y));
        if (xHub < xMax - TR1) {
          lineCut(L, fwd ? -xMax : -xHub, y, cz, fwd ? -xHub : -xMax, y, cz, SZ);
          lineCut(L, fwd ? xHub : xMax, y, cz, fwd ? xMax : xHub, y, cz, SZ);
        }
      } else {
        lineCut(L, fwd ? -xMax : xMax, y, cz, fwd ? xMax : -xMax, y, cz, SZ);
      }
      fwd = !fwd;
    }
  }

  // ==========================================================
  //  Phase 2: SEMI-FINISH — T3 φ8 R1 Bull Nose (3-axis contour)
  // ==========================================================
  L.push('');
  L.push('(===== Phase 2: Semi-finish - T3 Bull Nose φ8 R1 =====)');
  L.push('T3 M6');
  L.push('M3 S14000');
  L.push(`G0 Z${SZ}`);

  // Hub contour at multiple Z levels
  L.push('(-- Hub contour --)');
  for (let z = 20; z >= 0; z -= 2) {
    circle(L, HUB_R + 1, z, SZ, 200, 800);
  }

  // Hub top dome (concentric circles)
  L.push('(-- Hub top --)');
  for (let r = 2; r <= HUB_R; r += 1.5) {
    const domeZ = 20 + 3 * Math.sqrt(1 - (r / HUB_R) * (r / HUB_R));
    circle(L, r, domeZ, SZ, 150, 800);
  }

  // Channel floor cleanup (concentric arcs between blades)
  L.push('(-- Channel floor cleanup --)');
  const TR3 = 4; // T3 tool radius
  const BLADE_CLR_SEMI = TR3 + 0.5;
  for (let z = 0; z >= -3; z -= 1.5) {
    for (let r = HUB_R + 5; r <= BLADE_OUTER_R - 2; r += 3) {
      // Generate arc segments that avoid blades
      const nSteps = Math.max(36, Math.ceil(2 * Math.PI * r / 2));
      let cutting = false;
      for (let s = 0; s <= nSteps; s++) {
        const angle = (s / nSteps) * 2 * Math.PI;
        const px = r * Math.cos(angle);
        const py = r * Math.sin(angle);

        if (!isNearBlade(px, py, z, BLADE_CLR_SEMI)) {
          if (!cutting) {
            L.push(`G0 X${px.toFixed(2)} Y${py.toFixed(2)}`);
            L.push(`G1 Z${z.toFixed(1)} F200`);
            cutting = true;
          } else {
            L.push(`G1 X${px.toFixed(2)} Y${py.toFixed(2)} F1000`);
          }
        } else {
          if (cutting) {
            L.push(`G0 Z${SZ}`);
            cutting = false;
          }
        }
      }
      if (cutting) {
        L.push(`G0 Z${SZ}`);
      }
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

  // For each blade, generate 5-axis toolpath along both sides
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
          const tz = z;

          const tiltAngle = side * 15;
          const bladeNormalAngle = surfAngle + side * Math.PI / 2;
          const aAx = tiltAngle * Math.cos(bladeNormalAngle);
          const bAx = tiltAngle * Math.sin(bladeNormalAngle);

          pts.push({ x: tx, y: ty, z: tz, a: aAx, b: bAx });
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

  // Hub dome finishing (5-axis, tool normal to dome surface)
  L.push('(-- Hub dome 5-axis finishing --)');
  for (let r = 1; r <= HUB_R - 0.5; r += 0.8) {
    const domeZ = 20 + 3 * Math.sqrt(Math.max(0, 1 - (r / HUB_R) * (r / HUB_R)));
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

// =============== G-code helpers ===============

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
 * Generate vertices for a simple dome target shape (for difference comparison)
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
