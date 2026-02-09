import * as THREE from 'three';
import { DexelModel } from './DexelModel';

/**
 * Converts a DexelModel into a Three.js mesh for rendering.
 * Uses a heightmap approach: for each grid cell, generates top/bottom faces
 * and side faces where heights differ from neighbors.
 */
export function dexelToMesh(
  model: DexelModel,
  colorMode: 'solid' | 'heightmap' | 'difference' = 'solid',
  targetModel?: DexelModel
): THREE.BufferGeometry {
  const { nx, ny, originX, originY, cellSize, segments } = model.grid;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  // Precompute top heights for neighbor checks
  const topZ = new Float32Array(nx * ny);
  const botZ = new Float32Array(nx * ny);
  const hasMat = new Uint8Array(nx * ny);

  for (let i = 0; i < nx * ny; i++) {
    const seg = segments[i];
    if (seg.length >= 2) {
      hasMat[i] = 1;
      topZ[i] = seg[seg.length - 1];
      botZ[i] = seg[0];
    }
  }

  // Color helper
  function getColor(ix: number, iy: number): [number, number, number] {
    if (colorMode === 'heightmap') {
      const z = topZ[iy * nx + ix];
      const minZ = model.bbox.minZ;
      const maxZ = model.bbox.maxZ;
      const t = (z - minZ) / (maxZ - minZ + 0.001);
      return heatmapColor(t);
    } else if (colorMode === 'difference' && targetModel) {
      const idx = iy * nx + ix;
      const currentTop = topZ[idx];
      const targetSeg = targetModel.grid.segments[idx];
      if (!targetSeg || targetSeg.length < 2) {
        // No target = excess material
        return [1.0, 0.3, 0.3]; // red
      }
      const targetTop = targetSeg[targetSeg.length - 1];
      const diff = currentTop - targetTop;
      if (diff > 0.05) {
        // Excess material (not yet cut enough)
        const t = Math.min(1, diff / 2.0);
        return [0.5 + 0.5 * t, 0.5 - 0.3 * t, 0.2]; // orange-red
      } else if (diff < -0.05) {
        // Over-cut (gouge)
        const t = Math.min(1, -diff / 2.0);
        return [0.2, 0.3, 0.5 + 0.5 * t]; // blue
      } else {
        return [0.3, 0.85, 0.4]; // green = within tolerance
      }
    }
    // solid
    return [0.7, 0.75, 0.8]; // metallic gray
  }

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix;
      if (!hasMat[idx]) continue;

      const x0 = originX + ix * cellSize;
      const x1 = x0 + cellSize;
      const y0 = originY + iy * cellSize;
      const y1 = y0 + cellSize;
      const zt = topZ[idx];
      const zb = botZ[idx];

      const [cr, cg, cb] = getColor(ix, iy);

      // Top face (2 triangles)
      pushQuad(positions, normals, colors,
        x0, y0, zt, x1, y0, zt, x1, y1, zt, x0, y1, zt,
        0, 0, 1, cr, cg, cb);

      // Bottom face
      pushQuad(positions, normals, colors,
        x0, y1, zb, x1, y1, zb, x1, y0, zb, x0, y0, zb,
        0, 0, -1, cr * 0.6, cg * 0.6, cb * 0.6);

      // Side faces - only where neighbor is different or missing
      // +X side
      if (ix === nx - 1 || !hasMat[idx + 1] || topZ[idx + 1] < zt - 0.001) {
        const nzt = (ix < nx - 1 && hasMat[idx + 1]) ? topZ[idx + 1] : zb;
        const sideTop = zt;
        const sideBot = Math.max(zb, nzt);
        if (sideTop > sideBot) {
          pushQuad(positions, normals, colors,
            x1, y0, sideBot, x1, y1, sideBot, x1, y1, sideTop, x1, y0, sideTop,
            1, 0, 0, cr * 0.85, cg * 0.85, cb * 0.85);
        }
      }

      // -X side
      if (ix === 0 || !hasMat[idx - 1] || topZ[idx - 1] < zt - 0.001) {
        const nzt = (ix > 0 && hasMat[idx - 1]) ? topZ[idx - 1] : zb;
        const sideTop = zt;
        const sideBot = Math.max(zb, nzt);
        if (sideTop > sideBot) {
          pushQuad(positions, normals, colors,
            x0, y1, sideBot, x0, y0, sideBot, x0, y0, sideTop, x0, y1, sideTop,
            -1, 0, 0, cr * 0.85, cg * 0.85, cb * 0.85);
        }
      }

      // +Y side
      if (iy === ny - 1 || !hasMat[idx + nx] || topZ[idx + nx] < zt - 0.001) {
        const nzt = (iy < ny - 1 && hasMat[idx + nx]) ? topZ[idx + nx] : zb;
        const sideTop = zt;
        const sideBot = Math.max(zb, nzt);
        if (sideTop > sideBot) {
          pushQuad(positions, normals, colors,
            x1, y1, sideBot, x0, y1, sideBot, x0, y1, sideTop, x1, y1, sideTop,
            0, 1, 0, cr * 0.9, cg * 0.9, cb * 0.9);
        }
      }

      // -Y side
      if (iy === 0 || !hasMat[idx - nx] || topZ[idx - nx] < zt - 0.001) {
        const nzt = (iy > 0 && hasMat[idx - nx]) ? topZ[idx - nx] : zb;
        const sideTop = zt;
        const sideBot = Math.max(zb, nzt);
        if (sideTop > sideBot) {
          pushQuad(positions, normals, colors,
            x0, y0, sideBot, x1, y0, sideBot, x1, y0, sideTop, x0, y0, sideTop,
            0, -1, 0, cr * 0.9, cg * 0.9, cb * 0.9);
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

function pushQuad(
  positions: number[], normals: number[], colors: number[],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
  nx: number, ny: number, nz: number,
  cr: number, cg: number, cb: number
) {
  // Triangle 1: v0, v1, v2
  positions.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
  // Triangle 2: v0, v2, v3
  positions.push(x0, y0, z0, x2, y2, z2, x3, y3, z3);

  for (let i = 0; i < 6; i++) {
    normals.push(nx, ny, nz);
    colors.push(cr, cg, cb);
  }
}

function heatmapColor(t: number): [number, number, number] {
  // Blue -> Cyan -> Green -> Yellow -> Red
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
    // Hemisphere
    const sphere = new THREE.SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const sphereMesh = new THREE.Mesh(sphere, material);
    sphereMesh.position.set(0, 0, radius);
    group.add(sphereMesh);

    // Cylinder (flute body above hemisphere)
    const cyl = new THREE.CylinderGeometry(radius, radius, fluteLength - radius, 24);
    const cylMesh = new THREE.Mesh(cyl, material);
    cylMesh.rotation.x = Math.PI / 2;
    cylMesh.position.set(0, 0, radius + (fluteLength - radius) / 2);
    group.add(cylMesh);
  } else if (toolType === 'bull_nose') {
    // Flat bottom with rounded corners (torus + cylinder)
    const torusR = radius - cornerRadius;
    const torus = new THREE.TorusGeometry(torusR, cornerRadius, 12, 24, Math.PI * 2);
    const torusMesh = new THREE.Mesh(torus, material);
    torusMesh.position.set(0, 0, cornerRadius);
    group.add(torusMesh);

    // Flat disk
    const disk = new THREE.CircleGeometry(torusR, 24);
    const diskMesh = new THREE.Mesh(disk, material);
    diskMesh.position.set(0, 0, 0);
    group.add(diskMesh);

    // Cylinder
    const cyl = new THREE.CylinderGeometry(radius, radius, fluteLength - cornerRadius, 24);
    const cylMesh = new THREE.Mesh(cyl, material);
    cylMesh.rotation.x = Math.PI / 2;
    cylMesh.position.set(0, 0, cornerRadius + (fluteLength - cornerRadius) / 2);
    group.add(cylMesh);
  } else {
    // Flat end mill
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
    const rapidPoints: number[] = [];
    const feedPoints: number[] = [];

    for (let i = 0; i < seg.points.length; i++) {
      const p = seg.points[i];
      if (p.type === 'rapid') {
        rapidPoints.push(p.x, p.y, p.z);
      } else {
        feedPoints.push(p.x, p.y, p.z);
      }
    }

    if (rapidPoints.length >= 6) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(rapidPoints, 3));
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: 0xff4444,
        transparent: true,
        opacity: 0.5,
      }));
      group.add(line);
    }

    if (feedPoints.length >= 6) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(feedPoints, 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.6,
      }));
      group.add(line);
    }
  }

  return group;
}
