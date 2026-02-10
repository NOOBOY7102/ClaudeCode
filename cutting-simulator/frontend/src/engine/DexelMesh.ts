import * as THREE from 'three';
import { DexelModel } from './DexelModel';

/**
 * Converts a DexelModel into a smooth heightmap mesh using indexed geometry.
 *
 * Key techniques for VERICUT-like smooth tool mark rendering:
 * 1. Shared vertices at cell centers -> continuous terrain surface
 * 2. Sobel-weighted central-difference normals -> smooth shading reveals scallops
 * 3. Indexed BufferGeometry -> efficient memory for high-resolution grids
 * 4. Step walls only where neighbor height differs significantly
 */
export function dexelToMesh(
  model: DexelModel,
  colorMode: 'solid' | 'heightmap' | 'difference' = 'solid',
  targetModel?: DexelModel
): THREE.BufferGeometry {
  const { nx, ny, originX, originY, cellSize, segments } = model.grid;
  const totalCells = nx * ny;

  // --- Precompute per-cell data ---
  const topZ = new Float32Array(totalCells);
  const botZ = new Float32Array(totalCells);
  const hasMat = new Uint8Array(totalCells);
  let zMin = 1e9, zMax = -1e9;

  for (let i = 0; i < totalCells; i++) {
    const seg = segments[i];
    if (seg.length >= 2) {
      hasMat[i] = 1;
      topZ[i] = seg[seg.length - 1];
      botZ[i] = seg[0];
      if (topZ[i] > zMax) zMax = topZ[i];
      if (topZ[i] < zMin) zMin = topZ[i];
    }
  }
  const zRange = zMax - zMin + 0.001;

  // --- Vertex index map ---
  const vertIdx = new Int32Array(totalCells).fill(-1);
  let vertCount = 0;
  for (let i = 0; i < totalCells; i++) {
    if (hasMat[i]) vertIdx[i] = vertCount++;
  }

  // --- Build vertex arrays ---
  const pos = new Float32Array(vertCount * 3);
  const nrm = new Float32Array(vertCount * 3);
  const col = new Float32Array(vertCount * 3);

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const ci = iy * nx + ix;
      const vi = vertIdx[ci];
      if (vi < 0) continue;

      const v3 = vi * 3;
      pos[v3]     = originX + (ix + 0.5) * cellSize;
      pos[v3 + 1] = originY + (iy + 0.5) * cellSize;
      pos[v3 + 2] = topZ[ci];

      // Sobel-weighted normal (3x3 kernel)
      const zC = topZ[ci];
      const zL  = (ix > 0      && hasMat[ci - 1])  ? topZ[ci - 1]  : zC;
      const zR  = (ix < nx - 1 && hasMat[ci + 1])  ? topZ[ci + 1]  : zC;
      const zD  = (iy > 0      && hasMat[ci - nx])  ? topZ[ci - nx]  : zC;
      const zU  = (iy < ny - 1 && hasMat[ci + nx])  ? topZ[ci + nx]  : zC;
      const zLD = (ix > 0      && iy > 0      && hasMat[ci - nx - 1]) ? topZ[ci - nx - 1] : zC;
      const zRD = (ix < nx - 1 && iy > 0      && hasMat[ci - nx + 1]) ? topZ[ci - nx + 1] : zC;
      const zLU = (ix > 0      && iy < ny - 1 && hasMat[ci + nx - 1]) ? topZ[ci + nx - 1] : zC;
      const zRU = (ix < nx - 1 && iy < ny - 1 && hasMat[ci + nx + 1]) ? topZ[ci + nx + 1] : zC;

      // Sobel: dz/dx = (zR + 2*zR_center + zRU - zL - 2*zL_center - zLU) / (8*cellSize)
      const dzdx = ((zRD + 2 * zR + zRU) - (zLD + 2 * zL + zLU)) / (8 * cellSize);
      const dzdy = ((zLU + 2 * zU + zRU) - (zLD + 2 * zD + zRD)) / (8 * cellSize);

      const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      nrm[v3]     = -dzdx / len;
      nrm[v3 + 1] = -dzdy / len;
      nrm[v3 + 2] = 1 / len;

      // Color
      let cr: number, cg: number, cb: number;
      if (colorMode === 'heightmap') {
        [cr, cg, cb] = heatmapColor((topZ[ci] - zMin) / zRange);
      } else if (colorMode === 'difference' && targetModel) {
        const tSeg = targetModel.grid.segments[ci];
        if (!tSeg || tSeg.length < 2) {
          [cr, cg, cb] = [1.0, 0.3, 0.3];
        } else {
          const diff = topZ[ci] - tSeg[tSeg.length - 1];
          if (diff > 0.05) {
            const t = Math.min(1, diff / 2.0);
            [cr, cg, cb] = [0.5 + 0.5 * t, 0.5 - 0.3 * t, 0.2];
          } else if (diff < -0.05) {
            const t = Math.min(1, -diff / 2.0);
            [cr, cg, cb] = [0.2, 0.3, 0.5 + 0.5 * t];
          } else {
            [cr, cg, cb] = [0.3, 0.85, 0.4];
          }
        }
      } else {
        // Metallic aluminum: subtle height variation
        const h = (topZ[ci] - zMin) / zRange;
        cr = 0.78 + h * 0.07;
        cg = 0.80 + h * 0.07;
        cb = 0.83 + h * 0.07;
      }
      col[v3] = cr; col[v3 + 1] = cg; col[v3 + 2] = cb;
    }
  }

  // --- Top surface indices ---
  const indices: number[] = [];
  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const v00 = vertIdx[iy * nx + ix];
      const v10 = vertIdx[iy * nx + ix + 1];
      const v01 = vertIdx[(iy + 1) * nx + ix];
      const v11 = vertIdx[(iy + 1) * nx + ix + 1];

      if (v00 >= 0 && v10 >= 0 && v01 >= 0) indices.push(v00, v10, v01);
      if (v10 >= 0 && v11 >= 0 && v01 >= 0) indices.push(v10, v11, v01);
    }
  }

  // --- Side walls (non-indexed, appended) ---
  const wallPos: number[] = [];
  const wallNrm: number[] = [];
  const wallCol: number[] = [];
  const thresh = cellSize * 0.15;

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const ci = iy * nx + ix;
      if (!hasMat[ci]) continue;

      const cx = originX + (ix + 0.5) * cellSize;
      const cy = originY + (iy + 0.5) * cellSize;
      const zt = topZ[ci];
      const zb = botZ[ci];
      const h = cellSize * 0.5;

      // -X
      const hasL = ix > 0 && hasMat[ci - 1];
      if (!hasL) {
        pushWall(wallPos, wallNrm, wallCol, cx-h,cy-h, cx-h,cy+h, zb, zt, -1,0,0);
      } else if (zt - topZ[ci-1] > thresh) {
        pushWall(wallPos, wallNrm, wallCol, cx-h,cy-h, cx-h,cy+h, topZ[ci-1], zt, -1,0,0);
      }
      // +X
      const hasR = ix < nx-1 && hasMat[ci + 1];
      if (!hasR) {
        pushWall(wallPos, wallNrm, wallCol, cx+h,cy+h, cx+h,cy-h, zb, zt, 1,0,0);
      } else if (zt - topZ[ci+1] > thresh) {
        pushWall(wallPos, wallNrm, wallCol, cx+h,cy+h, cx+h,cy-h, topZ[ci+1], zt, 1,0,0);
      }
      // -Y
      const hasD = iy > 0 && hasMat[ci - nx];
      if (!hasD) {
        pushWall(wallPos, wallNrm, wallCol, cx+h,cy-h, cx-h,cy-h, zb, zt, 0,-1,0);
      } else if (zt - topZ[ci-nx] > thresh) {
        pushWall(wallPos, wallNrm, wallCol, cx+h,cy-h, cx-h,cy-h, topZ[ci-nx], zt, 0,-1,0);
      }
      // +Y
      const hasU = iy < ny-1 && hasMat[ci + nx];
      if (!hasU) {
        pushWall(wallPos, wallNrm, wallCol, cx-h,cy+h, cx+h,cy+h, zb, zt, 0,1,0);
      } else if (zt - topZ[ci+nx] > thresh) {
        pushWall(wallPos, wallNrm, wallCol, cx-h,cy+h, cx+h,cy+h, topZ[ci+nx], zt, 0,1,0);
      }
    }
  }

  // --- Merge into single geometry ---
  const wallVerts = wallPos.length / 3;
  const totalVerts = vertCount + wallVerts;
  const finalPos = new Float32Array(totalVerts * 3);
  const finalNrm = new Float32Array(totalVerts * 3);
  const finalCol = new Float32Array(totalVerts * 3);

  finalPos.set(pos); finalNrm.set(nrm); finalCol.set(col);
  for (let i = 0; i < wallVerts * 3; i++) {
    finalPos[vertCount * 3 + i] = wallPos[i];
    finalNrm[vertCount * 3 + i] = wallNrm[i];
    finalCol[vertCount * 3 + i] = wallCol[i];
  }
  // Wall triangles as indices
  for (let i = 0; i < wallVerts; i++) {
    indices.push(vertCount + i);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(finalPos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(finalNrm, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(finalCol, 3));
  geometry.setIndex(indices);

  return geometry;
}

// --- Helpers ---

function pushWall(
  p: number[], n: number[], c: number[],
  x0: number, y0: number, x1: number, y1: number,
  zBot: number, zTop: number,
  wnx: number, wny: number, wnz: number
) {
  const g = 0.55;
  p.push(x0,y0,zBot, x1,y1,zBot, x1,y1,zTop);
  p.push(x0,y0,zBot, x1,y1,zTop, x0,y0,zTop);
  for (let i = 0; i < 6; i++) { n.push(wnx,wny,wnz); c.push(g, g, g+0.03); }
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
