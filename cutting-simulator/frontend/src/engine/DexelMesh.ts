import * as THREE from 'three';
import { DexelModel } from './DexelModel';

/**
 * Tri-Dexel mesh generation.
 *
 * Produces 3 terrain-like heightmap meshes from the 3 orthogonal grids:
 * - Z-grid → top surface (XY plane, "height" = Z)
 * - X-grid → +X and -X side surfaces (YZ plane, "height" = X)
 * - Y-grid → +Y and -Y side surfaces (XZ plane, "height" = Y)
 *
 * Each surface uses indexed BufferGeometry with Sobel-weighted normals
 * for smooth shading that reveals tool scallop marks.
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

  // --- X-grid: +X side surface (max X values) ---
  baseVert = buildXSurface(model, colorMode, allPos, allNrm, allCol, allIdx, baseVert, true);

  // --- X-grid: -X side surface (min X values) ---
  baseVert = buildXSurface(model, colorMode, allPos, allNrm, allCol, allIdx, baseVert, false);

  // --- Y-grid: +Y side surface (max Y values) ---
  baseVert = buildYSurface(model, colorMode, allPos, allNrm, allCol, allIdx, baseVert, true);

  // --- Y-grid: -Y side surface (min Y values) ---
  buildYSurface(model, colorMode, allPos, allNrm, allCol, allIdx, baseVert, false);

  // --- Bottom surface (simple flat quad from Z-grid) ---
  // Skipped for performance - bottom is rarely visible

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(allNrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(allCol, 3));
  geometry.setIndex(allIdx);

  return geometry;
}

// =================================================================
// Z-grid top surface (existing heightmap approach)
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

  // Vertex index map
  const vertIdx = new Int32Array(totalCells).fill(-1);
  let vertCount = 0;
  for (let i = 0; i < totalCells; i++) {
    if (hasMat[i]) vertIdx[i] = vertCount++;
  }

  // Build vertices
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const ci = iy * nx + ix;
      if (vertIdx[ci] < 0) continue;

      const px = ox + (ix + 0.5) * cs;
      const py = oy + (iy + 0.5) * cs;
      const pz = topZ[ci];
      allPos.push(px, py, pz);

      // Sobel normal
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

      // Color
      const c = surfaceColor(colorMode, topZ[ci], zMin, zRange);
      allCol.push(c[0], c[1], c[2]);
    }
  }

  // Triangles
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
// X-grid side surface (+X or -X)
// =================================================================
function buildXSurface(
  model: DexelModel,
  colorMode: string,
  allPos: number[], allNrm: number[], allCol: number[], allIdx: number[],
  baseVert: number,
  isMax: boolean
): number {
  const { ny, nz } = model;
  const cs = model.resolution;
  const oy = model.bbox.minY;
  const oz = model.bbox.minZ;
  const totalCells = ny * nz;

  // Extract surface values: for +X use max X (last seg end), for -X use min X (first seg start)
  const valArr = new Float32Array(totalCells);
  const hasMat = new Uint8Array(totalCells);
  let vMin = 1e9, vMax = -1e9;

  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      const idx = iz * ny + iy;
      const seg = model.xGrid.segments[idx];
      if (seg.length >= 2) {
        hasMat[idx] = 1;
        const v = isMax ? seg[seg.length - 1] : seg[0];
        valArr[idx] = v;
        if (v > vMax) vMax = v;
        if (v < vMin) vMin = v;
      }
    }
  }
  const vRange = vMax - vMin + 0.001;

  // Vertex index map
  const vertIdx = new Int32Array(totalCells).fill(-1);
  let vertCount = 0;
  for (let i = 0; i < totalCells; i++) {
    if (hasMat[i]) vertIdx[i] = vertCount++;
  }

  // Build vertices (position in world: X = valArr, Y = cellY, Z = cellZ)
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      const ci = iz * ny + iy;
      if (vertIdx[ci] < 0) continue;

      const py = oy + (iy + 0.5) * cs;
      const pz = oz + (iz + 0.5) * cs;
      const px = valArr[ci];
      allPos.push(px, py, pz);

      // Sobel normal in YZ plane: compute dX/dY and dX/dZ
      const xC = valArr[ci];
      const xL  = (iy > 0      && hasMat[ci - 1])    ? valArr[ci - 1]    : xC;
      const xR  = (iy < ny - 1 && hasMat[ci + 1])    ? valArr[ci + 1]    : xC;
      const xD  = (iz > 0      && hasMat[ci - ny])    ? valArr[ci - ny]    : xC;
      const xU  = (iz < nz - 1 && hasMat[ci + ny])    ? valArr[ci + ny]    : xC;
      const xLD = (iy > 0      && iz > 0      && hasMat[ci - ny - 1]) ? valArr[ci - ny - 1] : xC;
      const xRD = (iy < ny - 1 && iz > 0      && hasMat[ci - ny + 1]) ? valArr[ci - ny + 1] : xC;
      const xLU = (iy > 0      && iz < nz - 1 && hasMat[ci + ny - 1]) ? valArr[ci + ny - 1] : xC;
      const xRU = (iy < ny - 1 && iz < nz - 1 && hasMat[ci + ny + 1]) ? valArr[ci + ny + 1] : xC;

      const dxdy = ((xRD + 2 * xR + xRU) - (xLD + 2 * xL + xLU)) / (8 * cs);
      const dxdz = ((xLU + 2 * xU + xRU) - (xLD + 2 * xD + xRD)) / (8 * cs);

      // Normal for X surface: n = normalize(±1, -dxdy, -dxdz)
      const sign = isMax ? 1 : -1;
      const len = Math.sqrt(1 + dxdy * dxdy + dxdz * dxdz);
      allNrm.push(sign / len, -sign * dxdy / len, -sign * dxdz / len);

      const c = surfaceColor(colorMode, valArr[ci], vMin, vRange);
      allCol.push(c[0], c[1], c[2]);
    }
  }

  // Triangles (in YZ grid)
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      const v00 = vertIdx[iz * ny + iy];
      const v10 = vertIdx[iz * ny + iy + 1];
      const v01 = vertIdx[(iz + 1) * ny + iy];
      const v11 = vertIdx[(iz + 1) * ny + iy + 1];

      if (isMax) {
        // +X face: outward normal along +X
        if (v00 >= 0 && v10 >= 0 && v01 >= 0)
          allIdx.push(baseVert + v00, baseVert + v01, baseVert + v10);
        if (v10 >= 0 && v11 >= 0 && v01 >= 0)
          allIdx.push(baseVert + v10, baseVert + v01, baseVert + v11);
      } else {
        // -X face: outward normal along -X (reverse winding)
        if (v00 >= 0 && v10 >= 0 && v01 >= 0)
          allIdx.push(baseVert + v00, baseVert + v10, baseVert + v01);
        if (v10 >= 0 && v11 >= 0 && v01 >= 0)
          allIdx.push(baseVert + v10, baseVert + v11, baseVert + v01);
      }
    }
  }

  return baseVert + vertCount;
}

// =================================================================
// Y-grid side surface (+Y or -Y)
// =================================================================
function buildYSurface(
  model: DexelModel,
  colorMode: string,
  allPos: number[], allNrm: number[], allCol: number[], allIdx: number[],
  baseVert: number,
  isMax: boolean
): number {
  const { nx, nz } = model;
  const cs = model.resolution;
  const oxx = model.bbox.minX;
  const oz = model.bbox.minZ;
  const totalCells = nx * nz;

  const valArr = new Float32Array(totalCells);
  const hasMat = new Uint8Array(totalCells);
  let vMin = 1e9, vMax = -1e9;

  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iz * nx + ix;
      const seg = model.yGrid.segments[idx];
      if (seg.length >= 2) {
        hasMat[idx] = 1;
        const v = isMax ? seg[seg.length - 1] : seg[0];
        valArr[idx] = v;
        if (v > vMax) vMax = v;
        if (v < vMin) vMin = v;
      }
    }
  }
  const vRange = vMax - vMin + 0.001;

  const vertIdx = new Int32Array(totalCells).fill(-1);
  let vertCount = 0;
  for (let i = 0; i < totalCells; i++) {
    if (hasMat[i]) vertIdx[i] = vertCount++;
  }

  // Build vertices (position in world: X = cellX, Y = valArr, Z = cellZ)
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const ci = iz * nx + ix;
      if (vertIdx[ci] < 0) continue;

      const px = oxx + (ix + 0.5) * cs;
      const pz = oz + (iz + 0.5) * cs;
      const py = valArr[ci];
      allPos.push(px, py, pz);

      // Sobel normal in XZ plane: compute dY/dX and dY/dZ
      const yC = valArr[ci];
      const yL  = (ix > 0      && hasMat[ci - 1])    ? valArr[ci - 1]    : yC;
      const yR  = (ix < nx - 1 && hasMat[ci + 1])    ? valArr[ci + 1]    : yC;
      const yD  = (iz > 0      && hasMat[ci - nx])    ? valArr[ci - nx]    : yC;
      const yU  = (iz < nz - 1 && hasMat[ci + nx])    ? valArr[ci + nx]    : yC;
      const yLD = (ix > 0      && iz > 0      && hasMat[ci - nx - 1]) ? valArr[ci - nx - 1] : yC;
      const yRD = (ix < nx - 1 && iz > 0      && hasMat[ci - nx + 1]) ? valArr[ci - nx + 1] : yC;
      const yLU = (ix > 0      && iz < nz - 1 && hasMat[ci + nx - 1]) ? valArr[ci + nx - 1] : yC;
      const yRU = (ix < nx - 1 && iz < nz - 1 && hasMat[ci + nx + 1]) ? valArr[ci + nx + 1] : yC;

      const dydx = ((yRD + 2 * yR + yRU) - (yLD + 2 * yL + yLU)) / (8 * cs);
      const dydz = ((yLU + 2 * yU + yRU) - (yLD + 2 * yD + yRD)) / (8 * cs);

      const sign = isMax ? 1 : -1;
      const len = Math.sqrt(dydx * dydx + 1 + dydz * dydz);
      allNrm.push(-sign * dydx / len, sign / len, -sign * dydz / len);

      const c = surfaceColor(colorMode, valArr[ci], vMin, vRange);
      allCol.push(c[0], c[1], c[2]);
    }
  }

  // Triangles (in XZ grid)
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const v00 = vertIdx[iz * nx + ix];
      const v10 = vertIdx[iz * nx + ix + 1];
      const v01 = vertIdx[(iz + 1) * nx + ix];
      const v11 = vertIdx[(iz + 1) * nx + ix + 1];

      if (isMax) {
        if (v00 >= 0 && v10 >= 0 && v01 >= 0)
          allIdx.push(baseVert + v00, baseVert + v10, baseVert + v01);
        if (v10 >= 0 && v11 >= 0 && v01 >= 0)
          allIdx.push(baseVert + v10, baseVert + v11, baseVert + v01);
      } else {
        if (v00 >= 0 && v10 >= 0 && v01 >= 0)
          allIdx.push(baseVert + v00, baseVert + v01, baseVert + v10);
        if (v10 >= 0 && v11 >= 0 && v01 >= 0)
          allIdx.push(baseVert + v10, baseVert + v01, baseVert + v11);
      }
    }
  }

  return baseVert + vertCount;
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
  // Metallic aluminum with subtle variation
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
