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
//      Layer-by-layer zigzag clearing channels, avoiding hub
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
  // Twist: increases with Z and radius
  const twistRad = (BLADE_TWIST * Math.PI / 180);
  const rFrac = (r - HUB_R) / (BLADE_OUTER_R - HUB_R);
  const zFrac = Math.max(0, z) / BLADE_HEIGHT;
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
    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    // Blade half-width in angular terms
    const halfW = BLADE_THICKNESS / (2 * r);
    if (Math.abs(diff) < halfW) return true;
  }
  return false;
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
  // ==========================================================
  L.push('(===== Phase 1: Roughing - T1 Flat φ10 =====)');
  L.push('T1 M6');
  L.push('M3 S10000');
  L.push(`G0 Z${SZ}`);

  const TR1 = 5;
  const STEP1 = 6;

  // Layer-by-layer zigzag, clearing everything outside hub, keeping blades
  // But blades are thin — roughing doesn't avoid blades individually
  // Instead: rough entire channel area, leave material around blades for finishing
  const roughLayers = [20, 16, 12, 8, 4, 0];
  const hubAvoid = HUB_R + TR1 + 2; // avoid hub with clearance

  for (const cz of roughLayers) {
    L.push(`(-- Rough layer Z=${cz} --)`);
    let fwd = true;
    for (let y = -BLADE_OUTER_R; y <= BLADE_OUTER_R; y += STEP1) {
      const xMax = Math.sqrt(Math.max(0, BLADE_OUTER_R * BLADE_OUTER_R - y * y));
      if (xMax < TR1 + 1) continue;

      if (y * y < hubAvoid * hubAvoid) {
        // Split around hub
        const xHub = Math.sqrt(Math.max(0, hubAvoid * hubAvoid - y * y));
        // Left segment
        if (xHub < xMax - TR1) {
          lineCut(L, fwd ? -xMax : -xHub, y, cz, fwd ? -xHub : -xMax, y, cz, SZ);
        }
        // Right segment
        if (xHub < xMax - TR1) {
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

  // Channel floors between blades at a few Z levels
  L.push('(-- Channel floor cleanup --)');
  for (let z = 0; z >= -3; z -= 1.5) {
    for (let r = HUB_R + 2; r <= BLADE_OUTER_R - 2; r += 3) {
      circle(L, r, z, SZ, 200, 1000);
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
  // Tool follows the blade surface with the tool tilted to match blade normal
  const FINISH_STEP_Z = 1.5;  // Z step between passes
  const FINISH_STEP_R = 1.0;  // radial step

  for (let b = 0; b < NUM_BLADES; b++) {
    L.push(`(-- Blade ${b + 1} finishing --)`);

    // Machine both sides of each blade
    for (const side of [-1, 1]) {
      // From hub to tip at multiple Z levels
      for (let z = 0; z <= BLADE_HEIGHT; z += FINISH_STEP_Z) {
        const pts: { x: number; y: number; z: number; a: number; b: number }[] = [];

        for (let r = HUB_R + 1; r <= BLADE_OUTER_R - 1; r += FINISH_STEP_R) {
          const ba = bladeAngle(b, r, z);
          // Offset to blade surface (side)
          const halfW = BLADE_THICKNESS / (2 * r);
          const surfAngle = ba + side * halfW;

          // Tool tip position on blade surface
          const tx = r * Math.cos(surfAngle);
          const ty = r * Math.sin(surfAngle);
          const tz = z;

          // Tool tilt: lean away from blade surface
          // Normal to blade surface points radially outward + tangential
          const tiltAngle = side * 15; // 15 degrees lean
          const bladeNormalAngle = surfAngle + side * Math.PI / 2;
          // A-axis tilt (around X): component from blade normal
          const aAx = tiltAngle * Math.cos(bladeNormalAngle);
          // B-axis tilt (around Y): component from blade normal
          const bAx = tiltAngle * Math.sin(bladeNormalAngle);

          pts.push({ x: tx, y: ty, z: tz, a: aAx, b: bAx });
        }

        if (pts.length < 2) continue;

        // Rapid to start
        L.push(`G0 X${pts[0].x.toFixed(2)} Y${pts[0].y.toFixed(2)}`);
        L.push(`G0 Z${(pts[0].z + 3).toFixed(1)}`);
        L.push(`G1 Z${pts[0].z.toFixed(2)} A${pts[0].a.toFixed(2)} B${pts[0].b.toFixed(2)} F150`);

        // Cut along blade surface
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
    // Tool tilts outward to follow dome curvature
    const tiltDeg = (r / HUB_R) * 25; // more tilt at larger radius
    const nSteps = Math.max(16, Math.ceil(2 * Math.PI * r / 1.0));

    for (let s = 0; s <= nSteps; s++) {
      const angle = (s / nSteps) * 2 * Math.PI;
      const px = r * Math.cos(angle);
      const py = r * Math.sin(angle);
      // Tilt direction: radially outward
      const aAx = tiltDeg * Math.sin(angle);  // A = tilt around X
      const bAx = -tiltDeg * Math.cos(angle); // B = tilt around Y

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
  // Keep isInsideBlade accessible for potential future use
  void isInsideBlade;
  return (x: number, y: number) => {
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (dist >= radius) return baseZ;
    const t = 1 - (dist / radius);
    return baseZ + (topZ - baseZ) * Math.sqrt(t);
  };
}
