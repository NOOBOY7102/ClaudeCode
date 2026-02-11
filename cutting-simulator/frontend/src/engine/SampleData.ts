import type { ToolDefinition, BBox } from '../types';

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
  minX: -40,
  maxX: 40,
  minY: -40,
  maxY: 40,
  minZ: -10,
  maxZ: 20,
};

// === Mold Cavity Machining Demo ===
//
// Target shape:
//   - Stock: 80×80×30mm block
//   - Border wall: 5mm wide rim at Z=20 (stock top)
//   - Main cavity floor: Z=2
//   - Central ring boss: center (0,0), outer R=20, inner R=12, top Z=15
//   - Deep inner pocket inside boss ring: floor Z=-5
//
// Machining strategy:
//   Phase 1: Roughing     - T1 φ10 Flat (zigzag layers, boss avoidance)
//   Phase 2: Semi-finish  - T3 φ8 R1 Bull Nose (contour + floor cleanup)
//   Phase 3: Finishing     - T2 φ6 Ball (fine contour + surface spirals)

export function getDefaultGCode(): string {
  const L: string[] = [];
  const SZ = 25; // safe Z

  L.push('(=== Mold Cavity Machining Demo ===)');
  L.push('(Stock 80x80x30 | Ring boss + deep pocket)');
  L.push('G90 G21');
  L.push('');

  // =========================================================
  //  Phase 1: ROUGHING — T1 φ10 Flat End Mill
  // =========================================================
  L.push('(===== Phase 1: Roughing - T1 Flat φ10 =====)');
  L.push('T1 M6');
  L.push('M3 S12000');
  L.push(`G0 Z${SZ}`);

  const TR1 = 5;        // tool radius
  const STEP1 = 7;      // stepover (70% diameter)
  const WALL = -33;     // inner edge of border wall
  const WALL_MAX = 33;
  const BOSS_AVOID = 22; // outer R of boss + tool R + 2mm clearance

  // --- Main cavity: zigzag layers avoiding central boss ---
  const roughLayers = [17, 14, 11, 8, 5, 2];
  for (const cz of roughLayers) {
    L.push(`(-- Rough layer Z=${cz} --)`);
    let fwd = true;
    for (let y = WALL; y <= WALL_MAX; y += STEP1) {
      if (y * y < BOSS_AVOID * BOSS_AVOID) {
        // Row crosses boss zone — split left / right
        const xb = Math.sqrt(BOSS_AVOID * BOSS_AVOID - y * y);
        if (-xb > WALL + TR1) {
          lineCut(L, fwd ? WALL : -xb, y, cz, fwd ? -xb : WALL, y, cz, SZ);
        }
        if (xb < WALL_MAX - TR1) {
          lineCut(L, fwd ? xb : WALL_MAX, y, cz, fwd ? WALL_MAX : xb, y, cz, SZ);
        }
      } else {
        lineCut(L, fwd ? WALL : WALL_MAX, y, cz, fwd ? WALL_MAX : WALL, y, cz, SZ);
      }
      fwd = !fwd;
    }
  }

  // --- Inner pocket inside boss ring (R < 10) ---
  L.push('');
  L.push('(-- Rough inner pocket --)');
  const IR = 10; // inner clearing radius (leave 2mm for finishing)
  const innerLayers = [12, 9, 6, 3, 0, -3];
  for (const cz of innerLayers) {
    let fwd = true;
    for (let y = -IR; y <= IR; y += STEP1) {
      const xm = Math.sqrt(Math.max(0, IR * IR - y * y)) - TR1;
      if (xm < 1) continue;
      lineCut(L, fwd ? -xm : xm, y, cz, fwd ? xm : -xm, y, cz, SZ);
      fwd = !fwd;
    }
  }

  // =========================================================
  //  Phase 2: SEMI-FINISHING — T3 φ8 R1 Bull Nose
  // =========================================================
  L.push('');
  L.push('(===== Phase 2: Semi-finish - T3 Bull Nose φ8 R1 =====)');
  L.push('T3 M6');
  L.push('M3 S15000');
  L.push(`G0 Z${SZ}`);

  // --- Boss outer wall contour (R=19.5, Z=15→2) ---
  L.push('(-- Boss outer wall --)');
  for (let z = 15; z >= 2; z -= 2) {
    circle(L, 19.5, z, SZ, 200, 1000);
  }

  // --- Boss inner wall contour (R=12.5, Z=15→-5) ---
  L.push('(-- Boss inner wall --)');
  for (let z = 15; z >= -5; z -= 2) {
    circle(L, 12.5, z, SZ, 200, 1000);
  }

  // --- Pocket border wall (rectangular contour) ---
  L.push('(-- Pocket border walls --)');
  for (let z = 17; z >= 2; z -= 2) {
    rectContour(L, -34, -34, 34, 34, z, SZ, 200, 1000);
  }

  // --- Main pocket floor cleanup (Z=2, zigzag avoiding boss) ---
  L.push('(-- Main floor cleanup --)');
  const SEMI_STEP = 3;
  const BOSS_R_SEMI = 21;
  for (let y = WALL; y <= WALL_MAX; y += SEMI_STEP) {
    const fwd = (Math.round((y - WALL) / SEMI_STEP) % 2) === 0;
    if (y * y < BOSS_R_SEMI * BOSS_R_SEMI) {
      const xb = Math.sqrt(BOSS_R_SEMI * BOSS_R_SEMI - y * y);
      if (-xb > WALL + 1) {
        lineCut(L, fwd ? WALL : -xb, y, 2, fwd ? -xb : WALL, y, 2, SZ, 200, 1200);
      }
      if (xb < WALL_MAX - 1) {
        lineCut(L, fwd ? xb : WALL_MAX, y, 2, fwd ? WALL_MAX : xb, y, 2, SZ, 200, 1200);
      }
    } else {
      lineCut(L, fwd ? WALL : WALL_MAX, y, 2, fwd ? WALL_MAX : WALL, y, 2, SZ, 200, 1200);
    }
  }

  // --- Inner pocket floor cleanup (Z=-5, circular zigzag) ---
  L.push('(-- Inner pocket floor cleanup --)');
  for (let y = -10; y <= 10; y += SEMI_STEP) {
    const xm = Math.sqrt(Math.max(0, 100 - y * y)) - 2;
    if (xm < 1) continue;
    const fwd = (Math.round((y + 10) / SEMI_STEP) % 2) === 0;
    lineCut(L, fwd ? -xm : xm, y, -5, fwd ? xm : -xm, y, -5, SZ, 200, 1000);
  }

  // =========================================================
  //  Phase 3: FINISHING — T2 φ6 Ball End Mill
  // =========================================================
  L.push('');
  L.push('(===== Phase 3: Finishing - T2 Ball φ6 =====)');
  L.push('T2 M6');
  L.push('M3 S18000');
  L.push(`G0 Z${SZ}`);

  // --- Fine contour: boss outer wall (R≈19.5, Z=15→2, step 1mm) ---
  L.push('(-- Finish boss outer wall --)');
  for (let z = 15; z >= 2; z -= 1) {
    circle(L, 19.5, z, SZ, 150, 600);
  }

  // --- Fine contour: boss inner wall (R≈12, Z=15→-5, step 1mm) ---
  L.push('(-- Finish boss inner wall --)');
  for (let z = 15; z >= -5; z -= 1) {
    circle(L, 12, z, SZ, 150, 600);
  }

  // --- Boss top surface: concentric circles at Z=15 ---
  L.push('(-- Finish boss top surface --)');
  for (let r = 12.5; r <= 19.5; r += 0.8) {
    circle(L, r, 15, SZ, 150, 600);
  }

  // --- Inner pocket floor: concentric circles at Z=-5 ---
  L.push('(-- Finish inner pocket floor --)');
  for (let r = 1; r <= 11.5; r += 0.8) {
    circle(L, r, -5, SZ, 150, 600);
  }

  // --- Main pocket floor: concentric circles at Z=2 (boss outward) ---
  L.push('(-- Finish main pocket floor --)');
  for (let r = 21; r <= 35; r += 0.8) {
    circle(L, r, 2, SZ, 150, 600);
  }

  // --- Pocket border wall finishing (rectangular contour, fine step) ---
  L.push('(-- Finish pocket border walls --)');
  for (let z = 18; z >= 2; z -= 1) {
    rectContour(L, -34.5, -34.5, 34.5, 34.5, z, SZ, 150, 600);
  }

  L.push('');
  L.push('G0 Z50');
  L.push('M5');
  L.push('M30');

  return L.join('\n');
}

// =============== G-code generation helpers ===============

/** Rapid → plunge → linear cut → retract */
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

/** Full circle (G2) at given radius and Z */
function circle(
  L: string[], r: number, z: number,
  safeZ: number, plungeF: number, cutF: number
): void {
  L.push(`G0 X${r.toFixed(1)} Y0`);
  L.push(`G1 Z${z.toFixed(1)} F${plungeF}`);
  L.push(`G2 X${r.toFixed(1)} Y0 I${(-r).toFixed(1)} J0 F${cutF}`);
  L.push(`G0 Z${safeZ}`);
}

/** Rectangular contour (CW) */
function rectContour(
  L: string[],
  x0: number, y0: number, x1: number, y1: number,
  z: number, safeZ: number, plungeF: number, cutF: number
): void {
  L.push(`G0 X${x0.toFixed(1)} Y${y0.toFixed(1)}`);
  L.push(`G0 Z${(z + 2).toFixed(1)}`);
  L.push(`G1 Z${z.toFixed(1)} F${plungeF}`);
  L.push(`G1 X${x1.toFixed(1)} F${cutF}`);
  L.push(`G1 Y${y1.toFixed(1)}`);
  L.push(`G1 X${x0.toFixed(1)}`);
  L.push(`G1 Y${y0.toFixed(1)}`);
  L.push(`G0 Z${safeZ}`);
}

/**
 * Generate vertices for a simple dome target shape (for difference comparison)
 */
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
