import * as THREE from 'three';
import { DexelModel } from './DexelModel';

/**
 * Converts a DexelModel into a smooth heightmap-based Three.js mesh.
 *
 * Instead of flat quads per cell, we create a terrain mesh where each
 * Dexel cell center becomes a vertex, and triangles connect neighboring
 * vertices. Normals are computed from central differences of the height
 * field, producing smooth shading that reveals tool marks (scallops).
 */
export function dexelToMesh(
  model: DexelModel,
  colorMode: 'solid' | 'heightmap' | 'difference' = 'solid',
  targetModel?: DexelModel
): THREE.BufferGeometry {
  const { nx, ny, originX, originY, cellSize, segments } = model.grid;

  // --- Build height arrays ---
  const topZ = new Float32Array(nx * ny);
  const botZ = new Float32Array(nx * ny);
  const hasMat = new Uint8Array(nx * ny);
  let globalMinZ = 1e9, globalMaxZ = -1e9;

  for (let i = 0; i < nx * ny; i++) {
    const seg = segments[i];
    if (seg.length >= 2) {
      hasMat[i] = 1;
      topZ[i] = seg[seg.length - 1];
      botZ[i] = seg[0];
      if (topZ[i] > globalMaxZ) globalMaxZ = topZ[i];
      if (botZ[i] < globalMinZ) globalMinZ = botZ[i];
    }
  }

  // --- Compute smooth normals via central differences ---
  const normX = new Float32Array(nx * ny);
  const normY = new Float32Array(nx * ny);
  const normZ = new Float32Array(nx * ny);

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix;
      if (!hasMat[idx]) { normZ[idx] = 1; continue; }

      // Central differences for dz/dx and dz/dy
      const zL = (ix > 0 && hasMat[idx - 1]) ? topZ[idx - 1] : topZ[idx];
      const zR = (ix < nx - 1 && hasMat[idx + 1]) ? topZ[idx + 1] : topZ[idx];
      const zD = (iy > 0 && hasMat[idx - nx]) ? topZ[idx - nx] : topZ[idx];
      const zU = (iy < ny - 1 && hasMat[idx + nx]) ? topZ[idx + nx] : topZ[idx];

      const dzdx = (zR - zL) / (2 * cellSize);
      const dzdy = (zU - zD) / (2 * cellSize);

      // Normal = normalize(-dzdx, -dzdy, 1)
      const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      normX[idx] = -dzdx / len;
      normY[idx] = -dzdy / len;
      normZ[idx] = 1 / len;
    }
  }

  // --- Color computation ---
  const colR = new Float32Array(nx * ny);
  const colG = new Float32Array(nx * ny);
  const colB = new Float32Array(nx * ny);

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix;
      if (!hasMat[idx]) continue;

      let cr: number, cg: number, cb: number;

      if (colorMode === 'heightmap') {
        const range = globalMaxZ - globalMinZ + 0.001;
        const t = (topZ[idx] - globalMinZ) / range;
        [cr, cg, cb] = heatmapColor(t);
      } else if (colorMode === 'difference' && targetModel) {
        const tSeg = targetModel.grid.segments[idx];
        if (!tSeg || tSeg.length < 2) {
          [cr, cg, cb] = [1.0, 0.3, 0.3];
        } else {
          const diff = topZ[idx] - tSeg[tSeg.length - 1];
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
        // Solid: subtle variation from height to show curvature
        const base = 0.68;
        const range = globalMaxZ - globalMinZ + 0.001;
        const heightBias = ((topZ[idx] - globalMinZ) / range) * 0.12;
        cr = base + heightBias;
        cg = base + 0.03 + heightBias;
        cb = base + 0.08 + heightBias;
      }

      colR[idx] = cr;
      colG[idx] = cg;
      colB[idx] = cb;
    }
  }

  // --- Generate top surface mesh (smooth heightmap) ---
  // Each cell with material gets 2 triangles connecting to its +X, +Y, +X+Y neighbors.
  // Vertex positions are at cell centers with Z = topZ.
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const i00 = iy * nx + ix;
      const i10 = i00 + 1;
      const i01 = i00 + nx;
      const i11 = i00 + nx + 1;

      // Need at least 3 of 4 corners to have material for a triangle
      const m00 = hasMat[i00], m10 = hasMat[i10], m01 = hasMat[i01], m11 = hasMat[i11];
      const msum = m00 + m10 + m01 + m11;
      if (msum < 3) continue;

      const x0 = originX + (ix + 0.5) * cellSize;
      const x1 = originX + (ix + 1.5) * cellSize;
      const y0 = originY + (iy + 0.5) * cellSize;
      const y1 = originY + (iy + 1.5) * cellSize;

      // Triangle 1: (0,0) -> (1,0) -> (0,1)
      if (m00 && m10 && m01) {
        pushVertex(positions, normals, colors, x0, y0, topZ[i00], normX[i00], normY[i00], normZ[i00], colR[i00], colG[i00], colB[i00]);
        pushVertex(positions, normals, colors, x1, y0, topZ[i10], normX[i10], normY[i10], normZ[i10], colR[i10], colG[i10], colB[i10]);
        pushVertex(positions, normals, colors, x0, y1, topZ[i01], normX[i01], normY[i01], normZ[i01], colR[i01], colG[i01], colB[i01]);
      }

      // Triangle 2: (1,0) -> (1,1) -> (0,1)
      if (m10 && m11 && m01) {
        pushVertex(positions, normals, colors, x1, y0, topZ[i10], normX[i10], normY[i10], normZ[i10], colR[i10], colG[i10], colB[i10]);
        pushVertex(positions, normals, colors, x1, y1, topZ[i11], normX[i11], normY[i11], normZ[i11], colR[i11], colG[i11], colB[i11]);
        pushVertex(positions, normals, colors, x0, y1, topZ[i01], normX[i01], normY[i01], normZ[i01], colR[i01], colG[i01], colB[i01]);
      }
    }
  }

  // --- Bottom surface (flat) ---
  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const i00 = iy * nx + ix;
      const i10 = i00 + 1;
      const i01 = i00 + nx;
      const i11 = i00 + nx + 1;

      const m00 = hasMat[i00], m10 = hasMat[i10], m01 = hasMat[i01], m11 = hasMat[i11];
      if (m00 + m10 + m01 + m11 < 3) continue;

      const x0 = originX + (ix + 0.5) * cellSize;
      const x1 = originX + (ix + 1.5) * cellSize;
      const y0 = originY + (iy + 0.5) * cellSize;
      const y1 = originY + (iy + 1.5) * cellSize;

      const dk = 0.5; // darken bottom

      if (m00 && m10 && m01) {
        pushVertex(positions, normals, colors, x0, y1, botZ[i01], 0, 0, -1, colR[i01] * dk, colG[i01] * dk, colB[i01] * dk);
        pushVertex(positions, normals, colors, x1, y0, botZ[i10], 0, 0, -1, colR[i10] * dk, colG[i10] * dk, colB[i10] * dk);
        pushVertex(positions, normals, colors, x0, y0, botZ[i00], 0, 0, -1, colR[i00] * dk, colG[i00] * dk, colB[i00] * dk);
      }
      if (m10 && m11 && m01) {
        pushVertex(positions, normals, colors, x0, y1, botZ[i01], 0, 0, -1, colR[i01] * dk, colG[i01] * dk, colB[i01] * dk);
        pushVertex(positions, normals, colors, x1, y1, botZ[i11], 0, 0, -1, colR[i11] * dk, colG[i11] * dk, colB[i11] * dk);
        pushVertex(positions, normals, colors, x1, y0, botZ[i10], 0, 0, -1, colR[i10] * dk, colG[i10] * dk, colB[i10] * dk);
      }
    }
  }

  // --- Side walls at material boundaries ---
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix;
      if (!hasMat[idx]) continue;

      const cx = originX + (ix + 0.5) * cellSize;
      const cy = originY + (iy + 0.5) * cellSize;
      const zt = topZ[idx];
      const zb = botZ[idx];
      const halfCell = cellSize * 0.5;
      const [cr, cg, cb] = [colR[idx] * 0.75, colG[idx] * 0.75, colB[idx] * 0.75];

      // -X boundary
      if (ix === 0 || !hasMat[idx - 1]) {
        const wx = cx - halfCell;
        pushWallQuad(positions, normals, colors, wx, cy - halfCell, wx, cy + halfCell, zb, zt, -1, 0, 0, cr, cg, cb);
      }
      // +X boundary
      if (ix === nx - 1 || !hasMat[idx + 1]) {
        const wx = cx + halfCell;
        pushWallQuad(positions, normals, colors, wx, cy + halfCell, wx, cy - halfCell, zb, zt, 1, 0, 0, cr, cg, cb);
      }
      // -Y boundary
      if (iy === 0 || !hasMat[idx - nx]) {
        const wy = cy - halfCell;
        pushWallQuad(positions, normals, colors, cx + halfCell, wy, cx - halfCell, wy, zb, zt, 0, -1, 0, cr, cg, cb);
      }
      // +Y boundary
      if (iy === ny - 1 || !hasMat[idx + nx]) {
        const wy = cy + halfCell;
        pushWallQuad(positions, normals, colors, cx - halfCell, wy, cx + halfCell, wy, zb, zt, 0, 1, 0, cr, cg, cb);
      }

      // Internal step walls: where neighbor exists but has significantly different top Z
      // +X step
      if (ix < nx - 1 && hasMat[idx + 1]) {
        const nz = topZ[idx + 1];
        if (Math.abs(zt - nz) > cellSize * 0.3) {
          const wx = cx + halfCell;
          const lo = Math.min(zt, nz);
          const hi = Math.max(zt, nz);
          const fnx = zt > nz ? 1 : -1;
          pushWallQuad(positions, normals, colors,
            wx, cy - halfCell, wx, cy + halfCell,
            lo, hi, fnx, 0, 0, cr, cg, cb);
        }
      }
      // +Y step
      if (iy < ny - 1 && hasMat[idx + nx]) {
        const nz = topZ[idx + nx];
        if (Math.abs(zt - nz) > cellSize * 0.3) {
          const wy = cy + halfCell;
          const lo = Math.min(zt, nz);
          const hi = Math.max(zt, nz);
          const fny = zt > nz ? 1 : -1;
          pushWallQuad(positions, normals, colors,
            cx - halfCell, wy, cx + halfCell, wy,
            lo, hi, 0, fny, 0, cr, cg, cb);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  return geometry;
}

// --- Helpers ---

function pushVertex(
  positions: number[], normals: number[], colors: number[],
  x: number, y: number, z: number,
  nx: number, ny: number, nz: number,
  cr: number, cg: number, cb: number
) {
  positions.push(x, y, z);
  normals.push(nx, ny, nz);
  colors.push(cr, cg, cb);
}

function pushWallQuad(
  positions: number[], normals: number[], colors: number[],
  x0: number, y0: number, x1: number, y1: number,
  zBot: number, zTop: number,
  nx: number, ny: number, nz: number,
  cr: number, cg: number, cb: number
) {
  // Two triangles for a vertical quad
  pushVertex(positions, normals, colors, x0, y0, zBot, nx, ny, nz, cr, cg, cb);
  pushVertex(positions, normals, colors, x1, y1, zBot, nx, ny, nz, cr, cg, cb);
  pushVertex(positions, normals, colors, x1, y1, zTop, nx, ny, nz, cr, cg, cb);

  pushVertex(positions, normals, colors, x0, y0, zBot, nx, ny, nz, cr, cg, cb);
  pushVertex(positions, normals, colors, x1, y1, zTop, nx, ny, nz, cr, cg, cb);
  pushVertex(positions, normals, colors, x0, y0, zTop, nx, ny, nz, cr, cg, cb);
}

function heatmapColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.25) {
    const s = t / 0.25;
    return [0, s, 1];
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return [0, 1, 1 - s];
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return [s, 1, 0];
  } else {
    const s = (t - 0.75) / 0.25;
    return [1, 1 - s, 0];
  }
}

/**
 * Create a simple Three.js mesh representing the tool at a position
 */
export function createToolMesh(
  toolType: 'flat' | 'ball' | 'bull_nose',
  diameter: number,
  cornerRadius: number,
  fluteLength: number
): THREE.Group {
  const group = new THREE.Group();
  const radius = diameter / 2;
  const material = new THREE.MeshPhongMaterial({
    color: 0xdddd44,
    transparent: true,
    opacity: 0.7,
    shininess: 80,
  });

  if (toolType === 'ball') {
    const sphere = new THREE.SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const sphereMesh = new THREE.Mesh(sphere, material);
    sphereMesh.position.set(0, 0, radius);
    group.add(sphereMesh);

    const cyl = new THREE.CylinderGeometry(radius, radius, fluteLength - radius, 24);
    const cylMesh = new THREE.Mesh(cyl, material);
    cylMesh.rotation.x = Math.PI / 2;
    cylMesh.position.set(0, 0, radius + (fluteLength - radius) / 2);
    group.add(cylMesh);
  } else if (toolType === 'bull_nose') {
    const torusR = radius - cornerRadius;
    const torus = new THREE.TorusGeometry(torusR, cornerRadius, 12, 24, Math.PI * 2);
    const torusMesh = new THREE.Mesh(torus, material);
    torusMesh.position.set(0, 0, cornerRadius);
    group.add(torusMesh);

    const disk = new THREE.CircleGeometry(torusR, 24);
    const diskMesh = new THREE.Mesh(disk, material);
    diskMesh.position.set(0, 0, 0);
    group.add(diskMesh);

    const cyl = new THREE.CylinderGeometry(radius, radius, fluteLength - cornerRadius, 24);
    const cylMesh = new THREE.Mesh(cyl, material);
    cylMesh.rotation.x = Math.PI / 2;
    cylMesh.position.set(0, 0, cornerRadius + (fluteLength - cornerRadius) / 2);
    group.add(cylMesh);
  } else {
    const cyl = new THREE.CylinderGeometry(radius, radius, fluteLength, 24);
    const cylMesh = new THREE.Mesh(cyl, material);
    cylMesh.rotation.x = Math.PI / 2;
    cylMesh.position.set(0, 0, fluteLength / 2);
    group.add(cylMesh);
  }

  return group;
}

/**
 * Create toolpath line visualization
 */
export function createToolpathLines(segments: { points: { x: number; y: number; z: number; type: string }[] }[]): THREE.Group {
  const group = new THREE.Group();

  for (const seg of segments) {
    const feedPositions: number[] = [];
    let prevPoint: { x: number; y: number; z: number } | null = null;

    for (let i = 0; i < seg.points.length; i++) {
      const p = seg.points[i];
      if (p.type !== 'rapid' && prevPoint) {
        feedPositions.push(prevPoint.x, prevPoint.y, prevPoint.z);
        feedPositions.push(p.x, p.y, p.z);
      }
      prevPoint = p;
    }

    if (feedPositions.length >= 6) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(feedPositions, 3));
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.4,
      }));
      group.add(line);
    }
  }

  return group;
}
