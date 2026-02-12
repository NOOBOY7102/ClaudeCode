import * as THREE from 'three';
import { DexelModel } from './DexelModel';

/**
 * Tri-Dexel mesh generation.
 *
 * - Z-grid → top surface heightmap (Sobel normals, smooth shading)
 * - Z-grid boundary analysis → side walls (at material/air transitions)
 *
 * The X/Y dexel grids improve simulation accuracy but are NOT used for
 * rendering directly (they produce interior faces). Instead, side walls
 * are generated from Z-grid boundary detection.
 */
export function dexelToMesh(
  model: DexelModel,
  colorMode: 'solid' | 'heightmap' | 'difference' = 'solid',
  _targetModel?: DexelModel
): THREE.BufferGeometry {
  const allPos: number[] = [];
  const allNrm: number[] = [];
  const allCol: number[] = [];
  const allIdx: number[] = [];
  let baseVert = 0;

  // --- Z-grid: top surface ---
  baseVert = buildZTopSurface(model, colorMode, allPos, allNrm, allCol, allIdx, baseVert);

  // --- Z-grid: bottom surface ---
  baseVert = buildZBottomSurface(model, colorMode, allPos, allNrm, allCol, allIdx, baseVert);

  // --- Side walls from Z-grid boundary analysis ---
  buildSideWalls(model, allPos, allNrm, allCol, allIdx, baseVert);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(allNrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(allCol, 3));
  geometry.setIndex(allIdx);

  return geometry;
}

// =================================================================
// Z-grid top surface
// =================================================================
function buildZTopSurface(
  model: DexelModel,
  colorMode: string,
  allPos: number[], allNrm: number[], allCol: number[], allIdx: number[],
  baseVert: number
): number {
  const { nx, ny } = model;
  const cs = model.resolution;
  const ox = model.bbox.minX;
  const oy = model.bbox.minY;
  const totalCells = nx * ny;
  const segments = model.zGrid.segments;

  const topZ = new Float32Array(totalCells);
  const hasMat = new Uint8Array(totalCells);
  let zMin = 1e9, zMax = -1e9;

  for (let i = 0; i < totalCells; i++) {
    const seg = segments[i];
    if (seg.length >= 2) {
      hasMat[i] = 1;
      topZ[i] = seg[seg.length - 1];
      if (topZ[i] > zMax) zMax = topZ[i];
      if (topZ[i] < zMin) zMin = topZ[i];
    }
  }
  const zRange = zMax - zMin + 0.001;

  const vertIdx = new Int32Array(totalCells).fill(-1);
  let vertCount = 0;
  for (let i = 0; i < totalCells; i++) {
    if (hasMat[i]) vertIdx[i] = vertCount++;
  }

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const ci = iy * nx + ix;
      if (vertIdx[ci] < 0) continue;

      allPos.push(ox + (ix + 0.5) * cs, oy + (iy + 0.5) * cs, topZ[ci]);

      // Sobel 3x3 normal
      const zC = topZ[ci];
      const zL  = (ix > 0      && hasMat[ci - 1])  ? topZ[ci - 1]  : zC;
      const zR  = (ix < nx - 1 && hasMat[ci + 1])  ? topZ[ci + 1]  : zC;
      const zD  = (iy > 0      && hasMat[ci - nx])  ? topZ[ci - nx]  : zC;
      const zU  = (iy < ny - 1 && hasMat[ci + nx])  ? topZ[ci + nx]  : zC;
      const zLD = (ix > 0      && iy > 0      && hasMat[ci - nx - 1]) ? topZ[ci - nx - 1] : zC;
      const zRD = (ix < nx - 1 && iy > 0      && hasMat[ci - nx + 1]) ? topZ[ci - nx + 1] : zC;
      const zLU = (ix > 0      && iy < ny - 1 && hasMat[ci + nx - 1]) ? topZ[ci + nx - 1] : zC;
      const zRU = (ix < nx - 1 && iy < ny - 1 && hasMat[ci + nx + 1]) ? topZ[ci + nx + 1] : zC;

      const dzdx = ((zRD + 2 * zR + zRU) - (zLD + 2 * zL + zLU)) / (8 * cs);
      const dzdy = ((zLU + 2 * zU + zRU) - (zLD + 2 * zD + zRD)) / (8 * cs);
      const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      allNrm.push(-dzdx / len, -dzdy / len, 1 / len);

      const c = surfaceColor(colorMode, topZ[ci], zMin, zRange);
      allCol.push(c[0], c[1], c[2]);
    }
  }

  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const v00 = vertIdx[iy * nx + ix];
      const v10 = vertIdx[iy * nx + ix + 1];
      const v01 = vertIdx[(iy + 1) * nx + ix];
      const v11 = vertIdx[(iy + 1) * nx + ix + 1];
      if (v00 >= 0 && v10 >= 0 && v01 >= 0)
        allIdx.push(baseVert + v00, baseVert + v10, baseVert + v01);
      if (v10 >= 0 && v11 >= 0 && v01 >= 0)
        allIdx.push(baseVert + v10, baseVert + v11, baseVert + v01);
    }
  }

  return baseVert + vertCount;
}

// =================================================================
// Z-grid bottom surface (inverted normals)
// =================================================================
function buildZBottomSurface(
  model: DexelModel,
  _colorMode: string,
  allPos: number[], allNrm: number[], allCol: number[], allIdx: number[],
  baseVert: number
): number {
  const { nx, ny } = model;
  const cs = model.resolution;
  const ox = model.bbox.minX;
  const oy = model.bbox.minY;
  const totalCells = nx * ny;
  const segments = model.zGrid.segments;

  const botZ = new Float32Array(totalCells);
  const hasMat = new Uint8Array(totalCells);

  for (let i = 0; i < totalCells; i++) {
    const seg = segments[i];
    if (seg.length >= 2) {
      hasMat[i] = 1;
      botZ[i] = seg[0];
    }
  }

  const vertIdx = new Int32Array(totalCells).fill(-1);
  let vertCount = 0;

  // Only add bottom surface vertices at boundary cells (where neighbors differ or are empty)
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const ci = iy * nx + ix;
      if (!hasMat[ci]) continue;
      // Check if this cell is near a boundary or has a different bottom from stock
      const isEdge = ix === 0 || ix === nx - 1 || iy === 0 || iy === ny - 1;
      const hasEmptyNeighbor =
        (ix > 0 && !hasMat[ci - 1]) || (ix < nx - 1 && !hasMat[ci + 1]) ||
        (iy > 0 && !hasMat[ci - nx]) || (iy < ny - 1 && !hasMat[ci + nx]);
      if (isEdge || hasEmptyNeighbor) {
        vertIdx[ci] = vertCount++;
      }
    }
  }

  const g = 0.45; // darker color for bottom

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const ci = iy * nx + ix;
      if (vertIdx[ci] < 0) continue;
      allPos.push(ox + (ix + 0.5) * cs, oy + (iy + 0.5) * cs, botZ[ci]);
      allNrm.push(0, 0, -1);
      allCol.push(g, g, g + 0.03);
    }
  }

  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const v00 = vertIdx[iy * nx + ix];
      const v10 = vertIdx[iy * nx + ix + 1];
      const v01 = vertIdx[(iy + 1) * nx + ix];
      const v11 = vertIdx[(iy + 1) * nx + ix + 1];
      // Reverse winding for bottom face
      if (v00 >= 0 && v10 >= 0 && v01 >= 0)
        allIdx.push(baseVert + v00, baseVert + v01, baseVert + v10);
      if (v10 >= 0 && v11 >= 0 && v01 >= 0)
        allIdx.push(baseVert + v10, baseVert + v01, baseVert + v11);
    }
  }

  return baseVert + vertCount;
}

// =================================================================
// Side walls from Z-grid boundary detection
// =================================================================
function buildSideWalls(
  model: DexelModel,
  allPos: number[], allNrm: number[], allCol: number[], allIdx: number[],
  baseVert: number
): number {
  const { nx, ny } = model;
  const cs = model.resolution;
  const ox = model.bbox.minX;
  const oy = model.bbox.minY;
  const segments = model.zGrid.segments;
  const totalCells = nx * ny;

  const topZ = new Float32Array(totalCells);
  const botZ = new Float32Array(totalCells);
  const hasMat = new Uint8Array(totalCells);

  for (let i = 0; i < totalCells; i++) {
    const seg = segments[i];
    if (seg.length >= 2) {
      hasMat[i] = 1;
      topZ[i] = seg[seg.length - 1];
      botZ[i] = seg[0];
    }
  }

  const g = 0.55; // wall color (slightly darker than top)
  let vIdx = baseVert;

  // For each cell, check 4 neighbors. Generate wall quads at boundaries.
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const ci = iy * nx + ix;
      if (!hasMat[ci]) continue;

      const cx = ox + (ix + 0.5) * cs;
      const cy = oy + (iy + 0.5) * cs;
      const zt = topZ[ci];
      const zb = botZ[ci];
      const h = cs * 0.5;

      // -X wall
      if (ix === 0 || !hasMat[ci - 1]) {
        pushWallQuad(allPos, allNrm, allCol, allIdx,
          cx - h, cy - h, cx - h, cy + h, zb, zt, -1, 0, 0, g, vIdx);
        vIdx += 4;
      } else if (topZ[ci - 1] < zt - cs * 0.1) {
        pushWallQuad(allPos, allNrm, allCol, allIdx,
          cx - h, cy - h, cx - h, cy + h, topZ[ci - 1], zt, -1, 0, 0, g, vIdx);
        vIdx += 4;
      }

      // +X wall
      if (ix === nx - 1 || !hasMat[ci + 1]) {
        pushWallQuad(allPos, allNrm, allCol, allIdx,
          cx + h, cy + h, cx + h, cy - h, zb, zt, 1, 0, 0, g, vIdx);
        vIdx += 4;
      } else if (topZ[ci + 1] < zt - cs * 0.1) {
        pushWallQuad(allPos, allNrm, allCol, allIdx,
          cx + h, cy + h, cx + h, cy - h, topZ[ci + 1], zt, 1, 0, 0, g, vIdx);
        vIdx += 4;
      }

      // -Y wall
      if (iy === 0 || !hasMat[ci - nx]) {
        pushWallQuad(allPos, allNrm, allCol, allIdx,
          cx + h, cy - h, cx - h, cy - h, zb, zt, 0, -1, 0, g, vIdx);
        vIdx += 4;
      } else if (topZ[ci - nx] < zt - cs * 0.1) {
        pushWallQuad(allPos, allNrm, allCol, allIdx,
          cx + h, cy - h, cx - h, cy - h, topZ[ci - nx], zt, 0, -1, 0, g, vIdx);
        vIdx += 4;
      }

      // +Y wall
      if (iy === ny - 1 || !hasMat[ci + nx]) {
        pushWallQuad(allPos, allNrm, allCol, allIdx,
          cx - h, cy + h, cx + h, cy + h, zb, zt, 0, 1, 0, g, vIdx);
        vIdx += 4;
      } else if (topZ[ci + nx] < zt - cs * 0.1) {
        pushWallQuad(allPos, allNrm, allCol, allIdx,
          cx - h, cy + h, cx + h, cy + h, topZ[ci + nx], zt, 0, 1, 0, g, vIdx);
        vIdx += 4;
      }
    }
  }

  return vIdx;
}

/** Push an indexed wall quad (4 vertices, 2 triangles) */
function pushWallQuad(
  pos: number[], nrm: number[], col: number[], idx: number[],
  x0: number, y0: number, x1: number, y1: number,
  zBot: number, zTop: number,
  wnx: number, wny: number, wnz: number,
  g: number, baseIdx: number
): void {
  // 4 vertices: bottom-left, bottom-right, top-right, top-left
  pos.push(x0, y0, zBot);
  pos.push(x1, y1, zBot);
  pos.push(x1, y1, zTop);
  pos.push(x0, y0, zTop);

  for (let i = 0; i < 4; i++) {
    nrm.push(wnx, wny, wnz);
    col.push(g, g, g + 0.03);
  }

  // Two triangles: 0-1-2, 0-2-3
  idx.push(baseIdx, baseIdx + 1, baseIdx + 2);
  idx.push(baseIdx, baseIdx + 2, baseIdx + 3);
}

// =================================================================
// Shared helpers
// =================================================================

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
