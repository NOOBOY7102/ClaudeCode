import * as THREE from 'three';
import { DexelModel } from './DexelModel';

/**
 * Tri-Dexel → smooth mesh via Marching Cubes.
 *
 * 1. Sample the tri-dexel (Z/X/Y grids) into a 3D scalar field.
 *    Each voxel vertex stores a signed-distance-like value: distance to
 *    nearest dexel segment boundary, positive inside, negative outside.
 * 2. Run Marching Cubes on the scalar field (iso = 0) to extract surface.
 * 3. Compute gradient-based smooth normals from the scalar field.
 */

// =====================================================================
//  Main entry point
// =====================================================================
export function dexelToMesh(
  model: DexelModel,
  colorMode: 'solid' | 'heightmap' | 'difference' = 'solid',
  _targetModel?: DexelModel
): THREE.BufferGeometry {
  const { bbox, resolution: dcs } = model;
  // MC grid matches dexel resolution (no scaling down)
  const cs = dcs;
  // Add 1-cell padding so MC finds the bbox boundary surface
  const PAD = 1;
  const fnx = model.nx + 1 + 2 * PAD;
  const fny = model.ny + 1 + 2 * PAD;
  const fnz = model.nz + 1 + 2 * PAD;
  const ox = bbox.minX - PAD * cs;
  const oy = bbox.minY - PAD * cs;
  const oz = bbox.minZ - PAD * cs;

  // Build scalar field from tri-dexel
  const size = fnx * fny * fnz;
  const field = new Float32Array(size);

  sampleTriDexelField(model, field, fnx, fny, fnz, ox, oy, oz, cs);

  // Run Marching Cubes
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const zMin = bbox.minZ;
  const zMax = bbox.maxZ;
  const zRange = zMax - zMin + 0.001;

  marchingCubes(
    field, fnx, fny, fnz,
    0.0, // iso level (signed distance: 0 = surface)
    ox, oy, oz,
    cs, cs, cs,
    positions, normals,
    (z: number) => {
      const c = surfaceColor(colorMode, z, zMin, zRange);
      colors.push(c[0], c[1], c[2]);
    }
  );

  // Compute gradient-based smooth normals from scalar field
  computeGradientNormals(field, fnx, fny, fnz, ox, oy, oz, cs, positions, normals);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  return geometry;
}

// =====================================================================
//  Tri-dexel → scalar field sampling
// =====================================================================

/**
 * Sample the tri-dexel model into a 3D scalar field with signed-distance-like values.
 *
 * For each MC vertex, query all 3 dexel grids. Each grid produces a signed distance
 * along its ray axis (positive = inside, negative = outside, clamped to ±halfCell).
 * The final field value is the min of valid signed distances (intersection).
 * Out-of-bounds grids are excluded from the min so they don't create false holes.
 */
function sampleTriDexelField(
  model: DexelModel,
  field: Float32Array,
  fnx: number, fny: number, fnz: number,
  ox: number, oy: number, oz: number,
  cs: number
): void {
  const { bbox } = model;
  const dcs = model.resolution; // dexel cell size for grid index lookups
  const { nx, ny, nz } = model;
  const halfCs = cs * 0.5; // clamp distance to half a MC cell

  for (let iz = 0; iz < fnz; iz++) {
    const wz = oz + iz * cs;
    for (let iy = 0; iy < fny; iy++) {
      const wy = oy + iy * cs;
      for (let ix = 0; ix < fnx; ix++) {
        const wx = ox + ix * cs;
        const fi = iz * fny * fnx + iy * fnx + ix;

        let result = -halfCs; // default: outside (for padding cells)
        let validCount = 0;

        // Z-grid: column at (wx, wy), signed distance along Z
        const zix = Math.floor((wx - bbox.minX) / dcs);
        const ziy = Math.floor((wy - bbox.minY) / dcs);
        if (zix >= 0 && zix < nx && ziy >= 0 && ziy < ny) {
          const zSegs = model.zGrid.segments[ziy * nx + zix];
          const dZ = signedDistanceToSegments(zSegs, wz, halfCs);
          if (validCount === 0) result = dZ; else result = Math.min(result, dZ);
          validCount++;
        }

        // X-grid: column at (wy, wz), signed distance along X
        const xiy = Math.floor((wy - bbox.minY) / dcs);
        const xiz = Math.floor((wz - bbox.minZ) / dcs);
        if (xiy >= 0 && xiy < ny && xiz >= 0 && xiz < nz) {
          const xSegs = model.xGrid.segments[xiz * ny + xiy];
          const dX = signedDistanceToSegments(xSegs, wx, halfCs);
          if (validCount === 0) result = dX; else result = Math.min(result, dX);
          validCount++;
        }

        // Y-grid: column at (wx, wz), signed distance along Y
        const yix = Math.floor((wx - bbox.minX) / dcs);
        const yiz = Math.floor((wz - bbox.minZ) / dcs);
        if (yix >= 0 && yix < nx && yiz >= 0 && yiz < nz) {
          const ySegs = model.yGrid.segments[yiz * nx + yix];
          const dY = signedDistanceToSegments(ySegs, wy, halfCs);
          if (validCount === 0) result = dY; else result = Math.min(result, dY);
          validCount++;
        }

        field[fi] = result;
      }
    }
  }
}

/**
 * Compute signed distance from point t to the nearest segment boundary.
 * Positive = inside material, Negative = outside material.
 * Clamped to ±maxDist for numerical stability.
 */
function signedDistanceToSegments(segs: Float32Array, t: number, maxDist: number): number {
  if (segs.length === 0) return -maxDist;

  let minOutsideDist = maxDist; // nearest boundary when outside
  let minInsideDist = maxDist;  // nearest boundary when inside
  let inside = false;

  for (let i = 0; i < segs.length; i += 2) {
    const s = segs[i];
    const e = segs[i + 1];
    if (t >= s && t <= e) {
      inside = true;
      // Distance to nearest segment boundary
      const d = Math.min(t - s, e - t);
      if (d < minInsideDist) minInsideDist = d;
    } else {
      // Distance to nearest segment endpoint
      const d = t < s ? s - t : t - e;
      if (d < minOutsideDist) minOutsideDist = d;
    }
  }

  if (inside) {
    return Math.min(minInsideDist, maxDist);
  } else {
    return -Math.min(minOutsideDist, maxDist);
  }
}

/**
 * Replace face normals with gradient-based smooth normals from the scalar field.
 * For each vertex, compute the gradient of the field using central differences.
 */
function computeGradientNormals(
  field: Float32Array,
  fnx: number, fny: number, fnz: number,
  ox: number, oy: number, oz: number,
  cs: number,
  positions: number[],
  normals: number[]
): void {
  const vertCount = positions.length / 3;
  for (let v = 0; v < vertCount; v++) {
    const px = positions[v * 3];
    const py = positions[v * 3 + 1];
    const pz = positions[v * 3 + 2];

    // Convert world position to field-space fractional index
    const fx = (px - ox) / cs;
    const fy = (py - oy) / cs;
    const fz = (pz - oz) / cs;

    // Sample field gradient via central differences
    const gx = sampleField(field, fnx, fny, fnz, fx + 0.5, fy, fz)
             - sampleField(field, fnx, fny, fnz, fx - 0.5, fy, fz);
    const gy = sampleField(field, fnx, fny, fnz, fx, fy + 0.5, fz)
             - sampleField(field, fnx, fny, fnz, fx, fy - 0.5, fz);
    const gz = sampleField(field, fnx, fny, fnz, fx, fy, fz + 0.5)
             - sampleField(field, fnx, fny, fnz, fx, fy, fz - 0.5);

    // Gradient points from low to high → outward normal is -gradient
    const len = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    normals[v * 3]     = -gx / len;
    normals[v * 3 + 1] = -gy / len;
    normals[v * 3 + 2] = -gz / len;
  }
}

/** Trilinear sample of the scalar field at fractional indices */
function sampleField(
  field: Float32Array, fnx: number, fny: number, fnz: number,
  fx: number, fy: number, fz: number
): number {
  const ix0 = Math.max(0, Math.min(fnx - 2, Math.floor(fx)));
  const iy0 = Math.max(0, Math.min(fny - 2, Math.floor(fy)));
  const iz0 = Math.max(0, Math.min(fnz - 2, Math.floor(fz)));
  const tx = fx - ix0, ty = fy - iy0, tz = fz - iz0;

  const i000 = iz0 * fny * fnx + iy0 * fnx + ix0;
  const i100 = i000 + 1;
  const i010 = i000 + fnx;
  const i110 = i010 + 1;
  const step = fny * fnx;
  const i001 = i000 + step;
  const i101 = i100 + step;
  const i011 = i010 + step;
  const i111 = i110 + step;

  return (
    field[i000] * (1 - tx) * (1 - ty) * (1 - tz) +
    field[i100] * tx       * (1 - ty) * (1 - tz) +
    field[i010] * (1 - tx) * ty       * (1 - tz) +
    field[i110] * tx       * ty       * (1 - tz) +
    field[i001] * (1 - tx) * (1 - ty) * tz +
    field[i101] * tx       * (1 - ty) * tz +
    field[i011] * (1 - tx) * ty       * tz +
    field[i111] * tx       * ty       * tz
  );
}

// =====================================================================
//  Marching Cubes implementation
// =====================================================================

/**
 * Marching Cubes isosurface extraction.
 * Generates triangle vertices + gradient-based normals directly into arrays.
 */
function marchingCubes(
  field: Float32Array,
  fnx: number, fny: number, fnz: number,
  iso: number,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  positions: number[],
  normals: number[],
  addColor: (z: number) => void
): void {
  // For each cube (8 corners from the scalar field)
  for (let iz = 0; iz < fnz - 1; iz++) {
    for (let iy = 0; iy < fny - 1; iy++) {
      for (let ix = 0; ix < fnx - 1; ix++) {
        // Get 8 corner values
        const v0 = field[idx(ix,   iy,   iz,   fnx, fny)];
        const v1 = field[idx(ix+1, iy,   iz,   fnx, fny)];
        const v2 = field[idx(ix+1, iy+1, iz,   fnx, fny)];
        const v3 = field[idx(ix,   iy+1, iz,   fnx, fny)];
        const v4 = field[idx(ix,   iy,   iz+1, fnx, fny)];
        const v5 = field[idx(ix+1, iy,   iz+1, fnx, fny)];
        const v6 = field[idx(ix+1, iy+1, iz+1, fnx, fny)];
        const v7 = field[idx(ix,   iy+1, iz+1, fnx, fny)];

        // Compute cube index (which corners are inside)
        let cubeIdx = 0;
        if (v0 >= iso) cubeIdx |= 1;
        if (v1 >= iso) cubeIdx |= 2;
        if (v2 >= iso) cubeIdx |= 4;
        if (v3 >= iso) cubeIdx |= 8;
        if (v4 >= iso) cubeIdx |= 16;
        if (v5 >= iso) cubeIdx |= 32;
        if (v6 >= iso) cubeIdx |= 64;
        if (v7 >= iso) cubeIdx |= 128;

        if (cubeIdx === 0 || cubeIdx === 255) continue;

        const edges = MC_EDGE_TABLE[cubeIdx];
        if (edges === 0) continue;

        // World coordinates of cube origin
        const cx = ox + ix * dx;
        const cy = oy + iy * dy;
        const cz = oz + iz * dz;

        // Interpolate edge vertices
        const edgeVerts: number[][] = new Array(12);
        if (edges & 1)    edgeVerts[0]  = interpEdge(cx,      cy,      cz,      cx + dx, cy,      cz,      v0, v1, iso);
        if (edges & 2)    edgeVerts[1]  = interpEdge(cx + dx, cy,      cz,      cx + dx, cy + dy, cz,      v1, v2, iso);
        if (edges & 4)    edgeVerts[2]  = interpEdge(cx + dx, cy + dy, cz,      cx,      cy + dy, cz,      v2, v3, iso);
        if (edges & 8)    edgeVerts[3]  = interpEdge(cx,      cy,      cz,      cx,      cy + dy, cz,      v0, v3, iso);
        if (edges & 16)   edgeVerts[4]  = interpEdge(cx,      cy,      cz + dz, cx + dx, cy,      cz + dz, v4, v5, iso);
        if (edges & 32)   edgeVerts[5]  = interpEdge(cx + dx, cy,      cz + dz, cx + dx, cy + dy, cz + dz, v5, v6, iso);
        if (edges & 64)   edgeVerts[6]  = interpEdge(cx + dx, cy + dy, cz + dz, cx,      cy + dy, cz + dz, v6, v7, iso);
        if (edges & 128)  edgeVerts[7]  = interpEdge(cx,      cy,      cz + dz, cx,      cy + dy, cz + dz, v4, v7, iso);
        if (edges & 256)  edgeVerts[8]  = interpEdge(cx,      cy,      cz,      cx,      cy,      cz + dz, v0, v4, iso);
        if (edges & 512)  edgeVerts[9]  = interpEdge(cx + dx, cy,      cz,      cx + dx, cy,      cz + dz, v1, v5, iso);
        if (edges & 1024) edgeVerts[10] = interpEdge(cx + dx, cy + dy, cz,      cx + dx, cy + dy, cz + dz, v2, v6, iso);
        if (edges & 2048) edgeVerts[11] = interpEdge(cx,      cy + dy, cz,      cx,      cy + dy, cz + dz, v3, v7, iso);

        // Generate triangles
        const tris = MC_TRI_TABLE[cubeIdx];
        for (let t = 0; t < tris.length; t += 3) {
          const a = edgeVerts[tris[t]];
          const b = edgeVerts[tris[t + 1]];
          const c = edgeVerts[tris[t + 2]];
          if (!a || !b || !c) continue;

          // Face normal from cross product
          const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
          const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
          let nx = aby * acz - abz * acy;
          let ny = abz * acx - abx * acz;
          let nz = abx * acy - aby * acx;
          const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;

          positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
          normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
          addColor(a[2]); addColor(b[2]); addColor(c[2]);
        }
      }
    }
  }
}

function idx(x: number, y: number, z: number, fnx: number, fny: number): number {
  return z * fny * fnx + y * fnx + x;
}

function interpEdge(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  v0: number, v1: number, iso: number
): number[] {
  const d = v1 - v0;
  const t = Math.abs(d) > 1e-6 ? (iso - v0) / d : 0.5;
  return [
    x0 + t * (x1 - x0),
    y0 + t * (y1 - y0),
    z0 + t * (z1 - z0),
  ];
}

// =====================================================================
//  Shared helpers
// =====================================================================

function surfaceColor(
  colorMode: string, val: number, valMin: number, valRange: number
): [number, number, number] {
  if (colorMode === 'heightmap') {
    return heatmapColor((val - valMin) / valRange);
  }
  const h = (val - valMin) / valRange;
  return [0.78 + h * 0.07, 0.80 + h * 0.07, 0.83 + h * 0.07];
}

function heatmapColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.25) { const s = t / 0.25; return [0, s, 1]; }
  if (t < 0.5)  { const s = (t - 0.25) / 0.25; return [0, 1, 1 - s]; }
  if (t < 0.75) { const s = (t - 0.5) / 0.25; return [s, 1, 0]; }
  const s = (t - 0.75) / 0.25; return [1, 1 - s, 0];
}

/** Create tool mesh */
export function createToolMesh(
  toolType: 'flat' | 'ball' | 'bull_nose',
  diameter: number, cornerRadius: number, fluteLength: number
): THREE.Group {
  const group = new THREE.Group();
  const r = diameter / 2;
  const mat = new THREE.MeshPhongMaterial({
    color: 0xdddd44, transparent: true, opacity: 0.7, shininess: 80 });

  if (toolType === 'ball') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16, 0, Math.PI*2, 0, Math.PI/2), mat);
    s.position.set(0,0,r); group.add(s);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, fluteLength-r, 24), mat);
    c.rotation.x = Math.PI/2; c.position.set(0,0,r+(fluteLength-r)/2); group.add(c);
  } else if (toolType === 'bull_nose') {
    const tr = r - cornerRadius;
    const t = new THREE.Mesh(new THREE.TorusGeometry(tr, cornerRadius, 12, 24), mat);
    t.position.set(0,0,cornerRadius); group.add(t);
    const d = new THREE.Mesh(new THREE.CircleGeometry(tr, 24), mat);
    group.add(d);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, fluteLength-cornerRadius, 24), mat);
    c.rotation.x = Math.PI/2; c.position.set(0,0,cornerRadius+(fluteLength-cornerRadius)/2); group.add(c);
  } else {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, fluteLength, 24), mat);
    c.rotation.x = Math.PI/2; c.position.set(0,0,fluteLength/2); group.add(c);
  }
  return group;
}

/** Create toolpath line visualization */
export function createToolpathLines(
  segments: { points: { x: number; y: number; z: number; type: string }[] }[]
): THREE.Group {
  const group = new THREE.Group();
  for (const seg of segments) {
    const pts: number[] = [];
    let prev: { x: number; y: number; z: number } | null = null;
    for (const p of seg.points) {
      if (p.type !== 'rapid' && prev) pts.push(prev.x,prev.y,prev.z, p.x,p.y,p.z);
      prev = p;
    }
    if (pts.length >= 6) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      group.add(new THREE.LineSegments(geo,
        new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.35 })));
    }
  }
  return group;
}

// =====================================================================
//  Marching Cubes lookup tables
// =====================================================================

/* eslint-disable */
const MC_EDGE_TABLE: number[] = [
  0x0,0x109,0x203,0x30a,0x406,0x50f,0x605,0x70c,0x80c,0x905,0xa0f,0xb06,0xc0a,0xd03,0xe09,0xf00,
  0x190,0x99,0x393,0x29a,0x596,0x49f,0x795,0x69c,0x99c,0x895,0xb9f,0xa96,0xd9a,0xc93,0xf99,0xe90,
  0x230,0x339,0x33,0x13a,0x636,0x73f,0x435,0x53c,0xa3c,0xb35,0x83f,0x936,0xe3a,0xf33,0xc39,0xd30,
  0x3a0,0x2a9,0x1a3,0xaa,0x7a6,0x6af,0x5a5,0x4ac,0xbac,0xaa5,0x9af,0x8a6,0xfaa,0xea3,0xda9,0xca0,
  0x460,0x569,0x663,0x76a,0x66,0x16f,0x265,0x36c,0xc6c,0xd65,0xe6f,0xf66,0x86a,0x963,0xa69,0xb60,
  0x5f0,0x4f9,0x7f3,0x6fa,0x1f6,0xff,0x3f5,0x2fc,0xdfc,0xcf5,0xfff,0xef6,0x9fa,0x8f3,0xbf9,0xaf0,
  0x650,0x759,0x453,0x55a,0x256,0x35f,0x55,0x15c,0xe5c,0xf55,0xc5f,0xd56,0xa5a,0xb53,0x859,0x950,
  0x7c0,0x6c9,0x5c3,0x4ca,0x3c6,0x2cf,0x1c5,0xcc,0xfcc,0xec5,0xdcf,0xcc6,0xbca,0xac3,0x9c9,0x8c0,
  0x8c0,0x9c9,0xac3,0xbca,0xcc6,0xdcf,0xec5,0xfcc,0xcc,0x1c5,0x2cf,0x3c6,0x4ca,0x5c3,0x6c9,0x7c0,
  0x950,0x859,0xb53,0xa5a,0xd56,0xc5f,0xf55,0xe5c,0x15c,0x55,0x35f,0x256,0x55a,0x453,0x759,0x650,
  0xaf0,0xbf9,0x8f3,0x9fa,0xef6,0xfff,0xcf5,0xdfc,0x2fc,0x3f5,0xff,0x1f6,0x6fa,0x7f3,0x4f9,0x5f0,
  0xb60,0xa69,0x963,0x86a,0xf66,0xe6f,0xd65,0xc6c,0x36c,0x265,0x16f,0x66,0x76a,0x663,0x569,0x460,
  0xca0,0xda9,0xea3,0xfaa,0x8a6,0x9af,0xaa5,0xbac,0x4ac,0x5a5,0x6af,0x7a6,0xaa,0x1a3,0x2a9,0x3a0,
  0xd30,0xc39,0xf33,0xe3a,0x936,0x83f,0xb35,0xa3c,0x53c,0x435,0x73f,0x636,0x13a,0x33,0x339,0x230,
  0xe90,0xf99,0xc93,0xd9a,0xa96,0xb9f,0x895,0x99c,0x69c,0x795,0x49f,0x596,0x29a,0x393,0x99,0x190,
  0xf00,0xe09,0xd03,0xc0a,0xb06,0xa0f,0x905,0x80c,0x70c,0x605,0x50f,0x406,0x30a,0x203,0x109,0x0
];

const MC_TRI_TABLE: number[][] = [
  [],[0,8,3],[0,1,9],[1,8,3,9,8,1],[1,2,10],[0,8,3,1,2,10],[9,2,10,0,2,9],[2,8,3,2,10,8,10,9,8],
  [3,11,2],[0,11,2,8,11,0],[1,9,0,2,3,11],[1,11,2,1,9,11,9,8,11],[3,10,1,11,10,3],[0,10,1,0,8,10,8,11,10],[3,9,0,3,11,9,11,10,9],[9,8,10,10,8,11],
  [4,7,8],[4,3,0,7,3,4],[0,1,9,8,4,7],[4,1,9,4,7,1,7,3,1],[1,2,10,8,4,7],[3,4,7,3,0,4,1,2,10],[9,2,10,9,0,2,8,4,7],[2,10,9,2,9,7,2,7,3,7,9,4],
  [8,4,7,3,11,2],[11,4,7,11,2,4,2,0,4],[9,0,1,8,4,7,2,3,11],[4,7,11,9,4,11,9,11,2,9,2,1],[3,10,1,3,11,10,7,8,4],[1,11,10,1,4,11,1,0,4,7,11,4],[4,7,8,9,0,11,9,11,10,11,0,3],[4,7,11,4,11,9,9,11,10],
  [9,5,4],[9,5,4,0,8,3],[0,5,4,1,5,0],[8,5,4,8,3,5,3,1,5],[1,2,10,9,5,4],[3,0,8,1,2,10,4,9,5],[5,2,10,5,4,2,4,0,2],[2,10,5,3,2,5,3,5,4,3,4,8],
  [9,5,4,2,3,11],[0,11,2,0,8,11,4,9,5],[0,5,4,0,1,5,2,3,11],[2,1,5,2,5,8,2,8,11,4,8,5],[10,3,11,10,1,3,9,5,4],[4,9,5,0,8,1,8,10,1,8,11,10],[5,4,0,5,0,11,5,11,10,11,0,3],[5,4,8,5,8,10,10,8,11],
  [9,7,8,5,7,9],[9,3,0,9,5,3,5,7,3],[0,7,8,0,1,7,1,5,7],[1,5,3,3,5,7],[9,7,8,9,5,7,10,1,2],[10,1,2,9,5,0,5,3,0,5,7,3],[8,0,2,8,2,5,8,5,7,10,5,2],[2,10,5,2,5,3,3,5,7],
  [7,9,5,7,8,9,3,11,2],[9,5,7,9,7,2,9,2,0,2,7,11],[2,3,11,0,1,8,1,7,8,1,5,7],[11,2,1,11,1,7,7,1,5],[9,5,8,8,5,7,10,1,3,10,3,11],[5,7,0,5,0,9,7,11,0,1,0,10,11,10,0],[11,10,0,11,0,3,10,5,0,8,0,7,5,7,0],[11,10,5,7,11,5],
  [10,6,5],[0,8,3,5,10,6],[9,0,1,5,10,6],[1,8,3,1,9,8,5,10,6],[1,6,5,2,6,1],[1,6,5,1,2,6,3,0,8],[9,6,5,9,0,6,0,2,6],[5,9,8,5,8,2,5,2,6,3,2,8],
  [2,3,11,10,6,5],[11,0,8,11,2,0,10,6,5],[0,1,9,2,3,11,5,10,6],[5,10,6,1,9,2,9,11,2,9,8,11],[6,3,11,6,5,3,5,1,3],[0,8,11,0,11,5,0,5,1,5,11,6],[3,11,6,0,3,6,0,6,5,0,5,9],[6,5,9,6,9,11,11,9,8],
  [5,10,6,4,7,8],[4,3,0,4,7,3,6,5,10],[1,9,0,5,10,6,8,4,7],[10,6,5,1,9,7,1,7,3,7,9,4],[6,1,2,6,5,1,4,7,8],[1,2,5,5,2,6,3,0,4,3,4,7],[8,4,7,9,0,5,0,6,5,0,2,6],[7,3,9,7,9,4,3,2,9,5,9,6,2,6,9],
  [3,11,2,7,8,4,10,6,5],[5,10,6,4,7,2,4,2,0,2,7,11],[0,1,9,4,7,8,2,3,11,5,10,6],[9,2,1,9,11,2,9,4,11,7,11,4,5,10,6],[8,4,7,3,11,5,3,5,1,5,11,6],[5,1,11,5,11,6,1,0,11,7,11,4,0,4,11],[0,5,9,0,6,5,0,3,6,11,6,3,8,4,7],[6,5,9,6,9,11,4,7,9,7,11,9],
  [10,4,9,6,4,10],[4,10,6,4,9,10,0,8,3],[10,0,1,10,6,0,6,4,0],[8,3,1,8,1,6,8,6,4,6,1,10],[1,4,9,1,2,4,2,6,4],[3,0,8,1,2,4,2,6,4,4,2,9 /*fix*/],[0,2,4,4,2,6],[8,3,2,8,2,4,4,2,6],
  [10,4,9,10,6,4,11,2,3],[0,8,2,2,8,11,4,9,10,4,10,6],[3,11,2,0,1,6,0,6,4,6,1,10],[6,4,1,6,1,10,4,8,1,2,1,11,8,11,1],[9,6,4,9,3,6,9,1,3,11,6,3],[8,11,1,8,1,0,11,6,1,9,1,4,6,4,1],[3,11,6,3,6,0,0,6,4],[6,4,8,11,6,8],
  [7,10,6,7,8,10,8,9,10],[0,7,3,0,10,7,0,9,10,6,7,10],[10,6,7,1,10,7,1,7,8,1,8,0],[10,6,7,10,7,1,1,7,3],[1,2,6,1,6,8,1,8,9,8,6,7],[2,6,9,2,9,1,6,7,9,0,9,3,7,3,9],[7,8,0,7,0,6,6,0,2],[7,3,2,6,7,2],
  [2,3,11,10,6,8,10,8,9,8,6,7],[2,0,7,2,7,11,0,9,7,6,7,10,9,10,7],[1,8,0,1,7,8,1,10,7,6,7,10,2,3,11],[11,2,1,11,1,7,10,6,1,6,7,1],[8,9,6,8,6,7,9,1,6,11,6,3,1,3,6],[0,9,1,11,6,7],[7,8,0,7,0,6,3,11,0,11,6,0],[7,11,6],
  [7,6,11],[3,0,8,11,7,6],[0,1,9,11,7,6],[8,1,9,8,3,1,11,7,6],[10,1,2,6,11,7],[1,2,10,3,0,8,6,11,7],[2,9,0,2,10,9,6,11,7],[6,11,7,2,10,3,10,8,3,10,9,8],
  [7,2,3,6,2,7],[7,0,8,7,6,0,6,2,0],[2,7,6,2,3,7,0,1,9],[1,6,2,1,8,6,1,9,8,8,7,6],[10,7,6,10,1,7,1,3,7],[10,7,6,1,7,10,1,8,7,1,0,8],[0,3,7,0,7,10,0,10,9,6,10,7],[7,6,10,7,10,8,8,10,9],
  [6,8,4,11,8,6],[3,6,11,3,0,6,0,4,6],[8,6,11,8,4,6,9,0,1],[9,4,6,9,6,3,9,3,1,11,3,6],[6,8,4,6,11,8,2,10,1],[1,2,10,3,0,11,0,6,11,0,4,6],[4,11,8,4,6,11,0,2,9,2,10,9],[10,9,3,10,3,2,9,4,3,11,3,6,4,6,3],
  [8,2,3,8,4,2,4,6,2],[0,4,2,4,6,2],[1,9,0,2,3,4,2,4,6,4,3,8],[1,9,4,1,4,2,2,4,6],[8,1,3,8,6,1,8,4,6,6,10,1],[10,1,0,10,0,6,6,0,4],[4,6,3,4,3,8,6,10,3,0,3,9,10,9,3],[10,9,4,6,10,4],
  [4,9,5,7,6,11],[0,8,3,4,9,5,11,7,6],[5,0,1,5,4,0,7,6,11],[11,7,6,8,3,4,3,5,4,3,1,5],[9,5,4,10,1,2,7,6,11],[6,11,7,1,2,10,0,8,3,4,9,5],[7,6,11,5,4,10,4,2,10,4,0,2],[3,4,8,3,5,4,3,2,5,10,5,2,11,7,6],
  [7,2,3,7,6,2,5,4,9],[9,5,4,0,8,6,0,6,2,6,8,7],[3,6,2,3,7,6,1,5,0,5,4,0],[6,2,8,6,8,7,2,1,8,4,8,5,1,5,8],[9,5,4,10,1,6,1,7,6,1,3,7],[1,6,10,1,7,6,1,0,7,8,7,0,9,5,4],[4,0,10,4,10,5,0,3,10,6,10,7,3,7,10],[7,6,10,7,10,8,5,4,10,4,8,10],
  [6,9,5,6,11,9,11,8,9],[3,6,11,0,6,3,0,5,6,0,9,5],[0,11,8,0,5,11,0,1,5,5,6,11],[6,11,3,6,3,5,5,3,1],[1,2,10,9,5,11,9,11,8,11,5,6],[0,11,3,0,6,11,0,9,6,5,6,9,1,2,10],[11,8,5,11,5,6,8,0,5,10,5,2,0,2,5],[6,11,3,6,3,5,2,10,3,10,5,3],
  [5,8,9,5,2,8,5,6,2,3,8,2],[9,5,6,9,6,0,0,6,2],[1,5,8,1,8,0,5,6,8,3,8,2,6,2,8],[1,5,6,2,1,6],[1,3,6,1,6,10,3,8,6,5,6,9,8,9,6],[10,1,0,10,0,6,9,5,0,5,6,0],[0,3,8,5,6,10],[10,5,6],
  [11,5,10,7,5,11],[11,5,10,11,7,5,8,3,0],[5,11,7,5,10,11,1,9,0],[10,7,5,10,11,7,9,8,1,8,3,1],[11,1,2,11,7,1,7,5,1],[0,8,3,1,2,7,1,7,5,7,2,11],[9,7,5,9,2,7,9,0,2,2,11,7],[7,5,2,7,2,11,5,9,2,3,2,8,9,8,2],
  [2,5,10,2,3,5,3,7,5],[8,2,0,8,5,2,8,7,5,10,2,5],[9,0,1,5,10,3,5,3,7,3,10,2],[9,8,2,9,2,1,8,7,2,10,2,5,7,5,2],[1,3,5,3,7,5],[0,8,7,0,7,1,1,7,5],[9,0,3,9,3,5,5,3,7],[9,8,7,5,9,7],
  [5,8,4,5,10,8,10,11,8],[5,0,4,5,11,0,5,10,11,11,3,0],[0,1,9,8,4,10,8,10,11,10,4,5],[10,11,4,10,4,5,11,3,4,9,4,1,3,1,4],[2,5,1,2,8,5,2,11,8,4,5,8],[0,4,11,0,11,3,4,5,11,2,11,1,5,1,11],[0,2,5,0,5,9,2,11,5,4,5,8,11,8,5],[9,4,5,2,11,3],
  [2,5,10,3,5,2,3,4,5,3,8,4],[5,10,2,5,2,4,4,2,0],[3,10,2,3,5,10,3,8,5,4,5,8,0,1,9],[5,10,2,5,2,4,1,9,2,9,4,2],[8,4,5,8,5,3,3,5,1],[0,4,5,1,0,5],[8,4,5,8,5,3,9,0,5,0,3,5],[9,4,5],
  [4,11,7,4,9,11,9,10,11],[0,8,3,4,9,7,9,11,7,9,10,11],[1,10,11,1,11,4,1,4,0,7,4,11],[3,1,4,3,4,8,1,10,4,7,4,11,10,11,4],[4,11,7,9,11,4,9,2,11,9,1,2],[9,7,4,9,11,7,9,1,11,2,11,1,0,8,3],[11,7,4,11,4,2,2,4,0],[11,7,4,11,4,2,8,3,4,3,2,4],
  [2,9,10,2,7,9,2,3,7,7,4,9],[9,10,7,9,7,4,10,2,7,8,7,0,2,0,7],[3,7,10,3,10,2,7,4,10,1,10,0,4,0,10],[1,10,2,8,7,4],[4,9,1,4,1,7,7,1,3],[4,9,1,4,1,7,0,8,1,8,7,1],[4,0,3,7,4,3],[4,8,7],
  [9,10,8,10,11,8],[3,0,9,3,9,11,11,9,10],[0,1,10,0,10,8,8,10,11],[3,1,10,11,3,10],[1,2,11,1,11,9,9,11,8],[3,0,9,3,9,11,1,2,9,2,11,9],[0,2,11,8,0,11],[3,2,11],
  [2,3,8,2,8,10,10,8,9],[9,10,2,0,9,2],[2,3,8,2,8,10,0,1,8,1,10,8],[1,10,2],[1,3,8,9,1,8],[0,9,1,8,3,0 /*fix*/],[0,3,8],[],
];
/* eslint-enable */
