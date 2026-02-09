import type { BBox, DexelGrid } from '../types';

/**
 * Z-direction Dexel model for material representation.
 * Each grid cell (i,j) stores a list of [zStart, zEnd] segments
 * representing solid material along the Z axis.
 */
export class DexelModel {
  grid: DexelGrid;

  bbox: BBox;
  resolution: number;

  constructor(bbox: BBox, resolution: number) {
    this.bbox = bbox;
    this.resolution = resolution;
    const nx = Math.ceil((bbox.maxX - bbox.minX) / resolution);
    const ny = Math.ceil((bbox.maxY - bbox.minY) / resolution);

    this.grid = {
      nx,
      ny,
      originX: bbox.minX,
      originY: bbox.minY,
      originZ: bbox.minZ,
      cellSize: resolution,
      segments: new Array(nx * ny),
    };

    // Initialize empty
    for (let i = 0; i < nx * ny; i++) {
      this.grid.segments[i] = new Float32Array(0);
    }
  }

  /**
   * Initialize as a rectangular block (stock)
   */
  initAsBlock(minZ: number, maxZ: number): void {
    const { nx, ny } = this.grid;
    const seg = new Float32Array([minZ, maxZ]);
    for (let i = 0; i < nx * ny; i++) {
      this.grid.segments[i] = new Float32Array(seg);
    }
  }

  /**
   * Initialize from an STL mesh by Z-ray casting.
   * vertices: flat array [x0,y0,z0, x1,y1,z1, x2,y2,z2, ...]
   * Each 9 consecutive values form a triangle.
   */
  initFromSTL(vertices: Float32Array): void {
    const { nx, ny, originX, originY, cellSize } = this.grid;
    const triCount = vertices.length / 9;

    // For each grid cell, cast a Z-ray and find intersections
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const rayX = originX + (ix + 0.5) * cellSize;
        const rayY = originY + (iy + 0.5) * cellSize;

        const hits: number[] = [];

        for (let t = 0; t < triCount; t++) {
          const base = t * 9;
          const z = rayTriangleIntersectZ(
            rayX, rayY,
            vertices[base], vertices[base + 1], vertices[base + 2],
            vertices[base + 3], vertices[base + 4], vertices[base + 5],
            vertices[base + 6], vertices[base + 7], vertices[base + 8]
          );
          if (z !== null) {
            hits.push(z);
          }
        }

        if (hits.length >= 2) {
          hits.sort((a, b) => a - b);
          // Pair up: [enter, exit, enter, exit, ...]
          const segs: number[] = [];
          for (let k = 0; k + 1 < hits.length; k += 2) {
            segs.push(hits[k], hits[k + 1]);
          }
          this.grid.segments[iy * nx + ix] = new Float32Array(segs);
        } else {
          this.grid.segments[iy * nx + ix] = new Float32Array(0);
        }
      }
    }
  }

  /**
   * Subtract a tool swept volume from the dexel model.
   * Tool moves linearly from p0 to p1.
   */
  subtractToolLinear(
    p0x: number, p0y: number, p0z: number,
    p1x: number, p1y: number, p1z: number,
    toolRadius: number,
    cornerRadius: number, // 0 for flat, toolRadius for ball
    toolLength: number
  ): void {
    const { nx, ny, originX, originY, cellSize } = this.grid;

    // AABB of swept volume
    const sweptMinX = Math.min(p0x, p1x) - toolRadius;
    const sweptMaxX = Math.max(p0x, p1x) + toolRadius;
    const sweptMinY = Math.min(p0y, p1y) - toolRadius;
    const sweptMaxY = Math.max(p0y, p1y) + toolRadius;

    const ix0 = Math.max(0, Math.floor((sweptMinX - originX) / cellSize));
    const ix1 = Math.min(nx - 1, Math.floor((sweptMaxX - originX) / cellSize));
    const iy0 = Math.max(0, Math.floor((sweptMinY - originY) / cellSize));
    const iy1 = Math.min(ny - 1, Math.floor((sweptMaxY - originY) / cellSize));

    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const cellIdx = iy * nx + ix;
        const cellX = originX + (ix + 0.5) * cellSize;
        const cellY = originY + (iy + 0.5) * cellSize;

        // Compute the Z interval cut by the tool swept volume at this XY
        const cutInterval = computeToolCutInterval(
          cellX, cellY,
          p0x, p0y, p0z, p1x, p1y, p1z,
          toolRadius, cornerRadius, toolLength
        );

        if (cutInterval) {
          this.grid.segments[cellIdx] = subtractInterval(
            this.grid.segments[cellIdx],
            cutInterval[0], cutInterval[1]
          );
        }
      }
    }
  }

  /**
   * Get the top Z value at a grid cell (for height map rendering)
   */
  getTopZ(ix: number, iy: number): number | null {
    const seg = this.grid.segments[iy * this.grid.nx + ix];
    if (!seg || seg.length === 0) return null;
    return seg[seg.length - 1]; // last end value
  }

  /**
   * Get the bottom Z value at a grid cell
   */
  getBottomZ(ix: number, iy: number): number | null {
    const seg = this.grid.segments[iy * this.grid.nx + ix];
    if (!seg || seg.length === 0) return null;
    return seg[0]; // first start value
  }

  /**
   * Check if a cell has any material
   */
  hasMaterial(ix: number, iy: number): boolean {
    const seg = this.grid.segments[iy * this.grid.nx + ix];
    return seg !== undefined && seg.length > 0;
  }

  /**
   * Compute total material volume
   */
  computeVolume(): number {
    const { nx, ny, cellSize } = this.grid;
    let volume = 0;
    const area = cellSize * cellSize;
    for (let i = 0; i < nx * ny; i++) {
      const seg = this.grid.segments[i];
      for (let k = 0; k + 1 < seg.length; k += 2) {
        volume += (seg[k + 1] - seg[k]) * area;
      }
    }
    return volume;
  }

  /**
   * Clone this model
   */
  clone(): DexelModel {
    const copy = new DexelModel(this.bbox, this.resolution);
    const { nx, ny } = this.grid;
    for (let i = 0; i < nx * ny; i++) {
      copy.grid.segments[i] = new Float32Array(this.grid.segments[i]);
    }
    return copy;
  }
}

// === Helper Functions ===

/**
 * Ray-Triangle intersection (Z-ray at given X,Y)
 * Returns Z value of intersection or null
 */
function rayTriangleIntersectZ(
  rx: number, ry: number,
  v0x: number, v0y: number, v0z: number,
  v1x: number, v1y: number, v1z: number,
  v2x: number, v2y: number, v2z: number
): number | null {
  // Compute 2D barycentric coords for the point (rx, ry) in triangle (v0,v1,v2) XY projection
  const d00x = v1x - v0x, d00y = v1y - v0y;
  const d01x = v2x - v0x, d01y = v2y - v0y;
  const d02x = rx - v0x, d02y = ry - v0y;

  const dot00 = d00x * d00x + d00y * d00y;
  const dot01 = d00x * d01x + d00y * d01y;
  const dot02 = d00x * d02x + d00y * d02y;
  const dot11 = d01x * d01x + d01y * d01y;
  const dot12 = d01x * d02x + d01y * d02y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return null;

  const invDenom = 1.0 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  if (u < -1e-6 || v < -1e-6 || u + v > 1.0 + 1e-6) return null;

  // Interpolate Z
  const d0z = v1z - v0z;
  const d1z = v2z - v0z;
  return v0z + u * d0z + v * d1z;
}

/**
 * Compute the Z interval that a tool swept linearly from p0 to p1
 * would cut at a given XY point.
 */
function computeToolCutInterval(
  cellX: number, cellY: number,
  p0x: number, p0y: number, p0z: number,
  p1x: number, p1y: number, p1z: number,
  toolRadius: number,
  cornerRadius: number,
  toolLength: number
): [number, number] | null {
  // Find the closest point on the line segment p0->p1 to the cell center (in XY)
  const dx = p1x - p0x;
  const dy = p1y - p0y;
  const dz = p1z - p0z;
  const lenSq = dx * dx + dy * dy;

  let t: number;
  if (lenSq < 1e-12) {
    t = 0;
  } else {
    t = ((cellX - p0x) * dx + (cellY - p0y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  // Closest tool center position (XY) on the path
  const tcx = p0x + t * dx;
  const tcy = p0y + t * dy;
  const tcz = p0z + t * dz; // tool tip Z at closest point

  const distSq = (cellX - tcx) * (cellX - tcx) + (cellY - tcy) * (cellY - tcy);
  const rSq = toolRadius * toolRadius;

  if (distSq > rSq) return null;

  const dist = Math.sqrt(distSq);

  // Compute the bottom of the cut based on tool profile
  let cutBottom: number;

  if (cornerRadius <= 0) {
    // Flat end mill: flat bottom at tool tip Z
    cutBottom = tcz;
  } else if (cornerRadius >= toolRadius - 0.001) {
    // Ball end mill: hemisphere
    // z_bottom = tcz + cornerRadius - sqrt(cornerRadius^2 - dist^2)
    const cRSq = cornerRadius * cornerRadius;
    if (distSq > cRSq) return null;
    cutBottom = tcz + cornerRadius - Math.sqrt(cRSq - distSq);
  } else {
    // Bull nose (radius) end mill
    // Inner flat region: dist <= (toolRadius - cornerRadius)
    const flatRadius = toolRadius - cornerRadius;
    if (dist <= flatRadius) {
      cutBottom = tcz;
    } else {
      // Torus region
      const localDist = dist - flatRadius;
      const cRSq = cornerRadius * cornerRadius;
      if (localDist * localDist > cRSq) return null;
      cutBottom = tcz + cornerRadius - Math.sqrt(cRSq - localDist * localDist);
    }
  }

  // But we also need to handle the full swept volume along the path.
  // For simplicity, we compute the min cutBottom across a few samples along the path.
  // This handles the case where the closest point approach isn't the deepest cut.
  let minBottom = cutBottom;

  // Sample additional points along the path
  const steps = Math.max(1, Math.ceil(Math.sqrt(lenSq) / (toolRadius * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const st = s / steps;
    const sx = p0x + st * dx;
    const sy = p0y + st * dy;
    const sz = p0z + st * dz;

    const sdSq = (cellX - sx) * (cellX - sx) + (cellY - sy) * (cellY - sy);
    if (sdSq > rSq) continue;

    const sDist = Math.sqrt(sdSq);
    let sBottom: number;

    if (cornerRadius <= 0) {
      sBottom = sz;
    } else if (cornerRadius >= toolRadius - 0.001) {
      const cRSq = cornerRadius * cornerRadius;
      if (sdSq > cRSq) continue;
      sBottom = sz + cornerRadius - Math.sqrt(cRSq - sdSq);
    } else {
      const flatRadius = toolRadius - cornerRadius;
      if (sDist <= flatRadius) {
        sBottom = sz;
      } else {
        const localDist = sDist - flatRadius;
        const cRSq = cornerRadius * cornerRadius;
        if (localDist * localDist > cRSq) continue;
        sBottom = sz + cornerRadius - Math.sqrt(cRSq - localDist * localDist);
      }
    }

    if (sBottom < minBottom) minBottom = sBottom;
  }

  const cutTop = minBottom + toolLength;

  return [minBottom, cutTop];
}

/**
 * Subtract an interval [cutStart, cutEnd] from a dexel segment list.
 * Returns new segment list.
 */
function subtractInterval(
  segments: Float32Array,
  cutStart: number,
  cutEnd: number
): Float32Array {
  if (segments.length === 0) return segments;

  const result: number[] = [];

  for (let k = 0; k + 1 < segments.length; k += 2) {
    const s = segments[k];
    const e = segments[k + 1];

    if (e <= cutStart || s >= cutEnd) {
      // No overlap - keep segment
      result.push(s, e);
    } else if (s >= cutStart && e <= cutEnd) {
      // Fully contained - remove segment (don't push)
    } else if (s < cutStart && e > cutEnd) {
      // Cut splits segment into two
      result.push(s, cutStart);
      result.push(cutEnd, e);
    } else if (s < cutStart) {
      // Trim end
      result.push(s, cutStart);
    } else {
      // Trim start
      result.push(cutEnd, e);
    }
  }

  return new Float32Array(result);
}
