/**
 * Target shape definition for impeller demo.
 *
 * This module defines the finished impeller shape as:
 *   - A mathematical function targetTopZ(x, y) → height
 *   - A smooth BufferGeometry builder for 3D visualization (STL-quality)
 *   - A DexelModel builder for toolpath generation
 *
 * The shape consists of:
 *   - Central hub with dome top (R=8, dome Z=20~23)
 *   - 5 twisted blades (R=8→30, Z=0→20, twist=25°)
 *   - Channel floor between blades (Z=-3)
 */
import * as THREE from 'three';
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

// =====================================================================
//  Smooth STL mesh generation (parametric surfaces)
// =====================================================================

/**
 * Build a smooth BufferGeometry representing the finished impeller.
 * Uses parametric surfaces for hub, dome, blades, and channel floor.
 */
export function buildTargetMesh(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  let vi = 0;

  // --- Hub cylinder wall ---
  const hubSegsA = 120; // angular
  const hubSegsZ = 20;  // vertical
  for (let ia = 0; ia < hubSegsA; ia++) {
    const a0 = (ia / hubSegsA) * Math.PI * 2;
    const a1 = ((ia + 1) / hubSegsA) * Math.PI * 2;
    for (let iz = 0; iz < hubSegsZ; iz++) {
      const z0 = FLOOR_Z + (iz / hubSegsZ) * (BLADE_HEIGHT - FLOOR_Z);
      const z1 = FLOOR_Z + ((iz + 1) / hubSegsZ) * (BLADE_HEIGHT - FLOOR_Z);
      const nx0 = Math.cos(a0), ny0 = Math.sin(a0);
      const nx1 = Math.cos(a1), ny1 = Math.sin(a1);
      // quad → 2 triangles
      const base = vi;
      pos.push(HUB_R * nx0, HUB_R * ny0, z0);
      pos.push(HUB_R * nx1, HUB_R * ny1, z0);
      pos.push(HUB_R * nx1, HUB_R * ny1, z1);
      pos.push(HUB_R * nx0, HUB_R * ny0, z1);
      nrm.push(nx0, ny0, 0, nx1, ny1, 0, nx1, ny1, 0, nx0, ny0, 0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      vi += 4;
    }
  }

  // --- Hub dome ---
  const domeSegsA = 120;
  const domeSegsR = 16;
  for (let ia = 0; ia < domeSegsA; ia++) {
    const a0 = (ia / domeSegsA) * Math.PI * 2;
    const a1 = ((ia + 1) / domeSegsA) * Math.PI * 2;
    for (let ir = 0; ir < domeSegsR; ir++) {
      const r0 = (ir / domeSegsR) * HUB_R;
      const r1 = ((ir + 1) / domeSegsR) * HUB_R;
      const z0 = BLADE_HEIGHT + HUB_DOME_HEIGHT * Math.sqrt(Math.max(0, 1 - (r0 / HUB_R) ** 2));
      const z1 = BLADE_HEIGHT + HUB_DOME_HEIGHT * Math.sqrt(Math.max(0, 1 - (r1 / HUB_R) ** 2));
      // Dome normal: derivative of z = H*sqrt(1-(r/R)^2) → dz/dr = -H*r/(R^2*sqrt(...))
      const dz0 = r0 < 0.01 ? 0 : -HUB_DOME_HEIGHT * r0 / (HUB_R * HUB_R * Math.sqrt(Math.max(0.001, 1 - (r0 / HUB_R) ** 2)));
      const dz1 = r1 < 0.01 ? 0 : -HUB_DOME_HEIGHT * r1 / (HUB_R * HUB_R * Math.sqrt(Math.max(0.001, 1 - (r1 / HUB_R) ** 2)));
      const cos0 = Math.cos(a0), sin0 = Math.sin(a0);
      const cos1 = Math.cos(a1), sin1 = Math.sin(a1);

      const n0 = normVec(-dz0 * cos0, -dz0 * sin0, 1);
      const n1 = normVec(-dz1 * cos0, -dz1 * sin0, 1);
      const n2 = normVec(-dz1 * cos1, -dz1 * sin1, 1);
      const n3 = normVec(-dz0 * cos1, -dz0 * sin1, 1);

      const base = vi;
      pos.push(r0 * cos0, r0 * sin0, z0);
      pos.push(r1 * cos0, r1 * sin0, z1);
      pos.push(r1 * cos1, r1 * sin1, z1);
      pos.push(r0 * cos1, r0 * sin1, z0);
      nrm.push(...n0, ...n1, ...n2, ...n3);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      vi += 4;
    }
  }

  // --- Blades ---
  const bladeSegsR = 40;
  const bladeSegsZ = 30;
  for (let b = 0; b < NUM_BLADES; b++) {
    // Two side faces (±half thickness) + top edge + bottom edge
    for (const side of [-1, 1]) {
      for (let ir = 0; ir < bladeSegsR; ir++) {
        const r0 = HUB_R + (ir / bladeSegsR) * (BLADE_OUTER_R - HUB_R);
        const r1 = HUB_R + ((ir + 1) / bladeSegsR) * (BLADE_OUTER_R - HUB_R);
        for (let iz = 0; iz < bladeSegsZ; iz++) {
          const z0 = (iz / bladeSegsZ) * BLADE_HEIGHT;
          const z1 = ((iz + 1) / bladeSegsZ) * BLADE_HEIGHT;

          const p00 = bladeSurfacePoint(b, r0, z0, side);
          const p10 = bladeSurfacePoint(b, r1, z0, side);
          const p11 = bladeSurfacePoint(b, r1, z1, side);
          const p01 = bladeSurfacePoint(b, r0, z1, side);
          const n = bladeSurfaceNormal(b, r0 + (r1 - r0) * 0.5, z0 + (z1 - z0) * 0.5, side);

          const base = vi;
          pos.push(p00[0], p00[1], p00[2]);
          pos.push(p10[0], p10[1], p10[2]);
          pos.push(p11[0], p11[1], p11[2]);
          pos.push(p01[0], p01[1], p01[2]);
          nrm.push(...n, ...n, ...n, ...n);
          if (side === 1) {
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          } else {
            idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
          }
          vi += 4;
        }
      }

      // Top edge strip (Z = BLADE_HEIGHT, from inner to outer R)
      for (let ir = 0; ir < bladeSegsR; ir++) {
        const r0 = HUB_R + (ir / bladeSegsR) * (BLADE_OUTER_R - HUB_R);
        const r1 = HUB_R + ((ir + 1) / bladeSegsR) * (BLADE_OUTER_R - HUB_R);
        const pA = bladeSurfacePoint(b, r0, BLADE_HEIGHT, -1);
        const pB = bladeSurfacePoint(b, r1, BLADE_HEIGHT, -1);
        const pC = bladeSurfacePoint(b, r1, BLADE_HEIGHT, 1);
        const pD = bladeSurfacePoint(b, r0, BLADE_HEIGHT, 1);
        const base = vi;
        pos.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], pC[0], pC[1], pC[2], pD[0], pD[1], pD[2]);
        nrm.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        vi += 4;
      }
    }
  }

  // --- Channel floor (annular ring at Z=FLOOR_Z) ---
  const floorSegsA = 120;
  const floorSegsR = 12;
  for (let ia = 0; ia < floorSegsA; ia++) {
    const a0 = (ia / floorSegsA) * Math.PI * 2;
    const a1 = ((ia + 1) / floorSegsA) * Math.PI * 2;
    for (let ir = 0; ir < floorSegsR; ir++) {
      const r0 = HUB_R + (ir / floorSegsR) * (BLADE_OUTER_R - HUB_R);
      const r1 = HUB_R + ((ir + 1) / floorSegsR) * (BLADE_OUTER_R - HUB_R);
      const base = vi;
      pos.push(
        r0 * Math.cos(a0), r0 * Math.sin(a0), FLOOR_Z,
        r1 * Math.cos(a0), r1 * Math.sin(a0), FLOOR_Z,
        r1 * Math.cos(a1), r1 * Math.sin(a1), FLOOR_Z,
        r0 * Math.cos(a1), r0 * Math.sin(a1), FLOOR_Z,
      );
      nrm.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      vi += 4;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

function bladeSurfacePoint(b: number, r: number, z: number, side: number): [number, number, number] {
  const ba = bladeAngle(b, r, z);
  const halfW = BLADE_THICKNESS / (2 * r);
  const a = ba + side * halfW;
  return [r * Math.cos(a), r * Math.sin(a), z];
}

function bladeSurfaceNormal(b: number, r: number, z: number, side: number): [number, number, number] {
  const ba = bladeAngle(b, r, z);
  const halfW = BLADE_THICKNESS / (2 * r);
  const a = ba + side * halfW;
  // Normal perpendicular to blade surface (tangential direction)
  return normVec(-Math.sin(a) * side, Math.cos(a) * side, 0);
}

function normVec(x: number, y: number, z: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}

/**
 * Build a DexelModel representing the finished impeller.
 * Only Z-grid is populated (sufficient for toolpath generation).
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
