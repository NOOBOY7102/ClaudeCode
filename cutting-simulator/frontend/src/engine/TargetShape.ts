/**
 * Target shape definition for impeller demo.
 *
 * This module defines the finished impeller shape as:
 *   - A mathematical function targetTopZ(x, y) → height
 *   - A DexelModel builder for 3D visualization
 *
 * The shape consists of:
 *   - Central hub with dome top (R=8, dome Z=20~23)
 *   - 5 twisted blades (R=8→30, Z=0→20, twist=25°)
 *   - Channel floor between blades (Z=-3)
 */
import { DexelModel } from './DexelModel';
import type { BBox } from '../types';

// Shape parameters (exported for use in SampleData.ts)
export const NUM_BLADES = 5;
export const HUB_R = 8;
export const BLADE_OUTER_R = 30;
export const BLADE_THICKNESS = 2.5;
export const BLADE_HEIGHT = 20;
export const BLADE_TWIST_DEG = 25;
export const FLOOR_Z = -3;
export const HUB_DOME_HEIGHT = 3;

/** Blade center angle at radius r and height z */
export function bladeAngle(bladeIdx: number, r: number, z: number): number {
  const baseAngle = (bladeIdx / NUM_BLADES) * 2 * Math.PI;
  const twistRad = (BLADE_TWIST_DEG * Math.PI / 180);
  const rFrac = Math.max(0, (r - HUB_R) / (BLADE_OUTER_R - HUB_R));
  const zFrac = Math.max(0, Math.min(z, BLADE_HEIGHT)) / BLADE_HEIGHT;
  return baseAngle + twistRad * rFrac * zFrac;
}

/** Check if (x,y,z) is inside any blade */
export function isInsideBlade(x: number, y: number, z: number): boolean {
  if (z < 0 || z > BLADE_HEIGHT) return false;
  const r = Math.sqrt(x * x + y * y);
  if (r < HUB_R || r > BLADE_OUTER_R) return false;
  const angle = Math.atan2(y, x);

  for (let b = 0; b < NUM_BLADES; b++) {
    const ba = bladeAngle(b, r, z);
    let diff = angle - ba;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < BLADE_THICKNESS / (2 * r)) return true;
  }
  return false;
}

/**
 * Target top Z height at world position (x, y).
 *
 * Returns the maximum Z of finished part material at this column.
 * Used for both display and toolpath generation.
 */
export function targetTopZ(x: number, y: number): number {
  const r = Math.sqrt(x * x + y * y);

  // Outside impeller → nothing (cut to stock bottom)
  if (r > BLADE_OUTER_R) return -100;

  // Hub → dome
  if (r <= HUB_R) {
    const rFrac = r / HUB_R;
    return BLADE_HEIGHT + HUB_DOME_HEIGHT * Math.sqrt(Math.max(0, 1 - rFrac * rFrac));
  }

  // Blade region: find highest Z where blade exists at (x,y)
  for (let z = BLADE_HEIGHT; z >= 0; z -= 0.5) {
    if (isInsideBlade(x, y, z)) return z;
  }

  // Channel between blades
  return FLOOR_Z;
}

/**
 * Build a DexelModel representing the finished impeller.
 * Only Z-grid is populated (sufficient for rendering).
 */
export function buildTargetModel(bbox: BBox, resolution: number): DexelModel {
  const model = new DexelModel(bbox, resolution);
  const { nx, ny } = model;
  const cs = resolution;
  const ox = bbox.minX;
  const oy = bbox.minY;

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = ox + (ix + 0.5) * cs;
      const y = oy + (iy + 0.5) * cs;
      const topZ = targetTopZ(x, y);

      if (topZ > FLOOR_Z - 1) {
        // Material from floor base to target top
        model.zGrid.segments[iy * nx + ix] = new Float32Array([FLOOR_Z - 1, topZ]);
      }
      // else: outside impeller → empty (no material)
    }
  }

  return model;
}
