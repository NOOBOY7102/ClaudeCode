import type { BBox, DexelGrid } from '../types';

/**
 * Tri-Dexel model: 3 orthogonal Dexel grids for isotropic material representation.
 *
 * - zGrid: nx×ny cells, rays along Z → top/bottom surfaces
 * - xGrid: ny×nz cells, rays along X → ±X side surfaces
 * - yGrid: nx×nz cells, rays along Y → ±Y side surfaces
 *
 * Each cell stores [start, end, start, end, ...] pairs as Float32Array.
 */
export class DexelModel {
  zGrid: DexelGrid;  // XY plane, rays along Z
  xGrid: DexelGrid;  // YZ plane, rays along X
  yGrid: DexelGrid;  // XZ plane, rays along Y

  bbox: BBox;
  resolution: number;
  nx: number;
  ny: number;
  nz: number;

  constructor(bbox: BBox, resolution: number) {
    this.bbox = bbox;
    this.resolution = resolution;
    this.nx = Math.ceil((bbox.maxX - bbox.minX) / resolution);
    this.ny = Math.ceil((bbox.maxY - bbox.minY) / resolution);
    this.nz = Math.ceil((bbox.maxZ - bbox.minZ) / resolution);

    // Z-grid: nx × ny, segments along Z
    this.zGrid = {
      nx: this.nx,
      ny: this.ny,
      originX: bbox.minX,
      originY: bbox.minY,
      originZ: bbox.minZ,
      cellSize: resolution,
      segments: new Array(this.nx * this.ny),
    };
    for (let i = 0; i < this.nx * this.ny; i++) {
      this.zGrid.segments[i] = new Float32Array(0);
    }

    // X-grid: ny × nz, segments along X
    this.xGrid = {
      nx: this.ny,
      ny: this.nz,
      originX: bbox.minY,
      originY: bbox.minZ,
      originZ: bbox.minX,
      cellSize: resolution,
      segments: new Array(this.ny * this.nz),
    };
    for (let i = 0; i < this.ny * this.nz; i++) {
      this.xGrid.segments[i] = new Float32Array(0);
    }

    // Y-grid: nx × nz, segments along Y
    this.yGrid = {
      nx: this.nx,
      ny: this.nz,
      originX: bbox.minX,
      originY: bbox.minZ,
      originZ: bbox.minY,
      cellSize: resolution,
      segments: new Array(this.nx * this.nz),
    };
    for (let i = 0; i < this.nx * this.nz; i++) {
      this.yGrid.segments[i] = new Float32Array(0);
    }
  }

  /**
   * Initialize as a rectangular block (stock).
   */
  initAsBlock(minZ: number, maxZ: number): void {
    const { bbox } = this;

    // Z-grid: each ray gets [minZ, maxZ]
    const zSeg = new Float32Array([minZ, maxZ]);
    for (let i = 0; i < this.nx * this.ny; i++) {
      this.zGrid.segments[i] = new Float32Array(zSeg);
    }

    // X-grid (YZ plane, rays along X): each ray gets [bbox.minX, bbox.maxX]
    const xSeg = new Float32Array([bbox.minX, bbox.maxX]);
    for (let iz = 0; iz < this.nz; iz++) {
      const cellZ = bbox.minZ + (iz + 0.5) * this.resolution;
      for (let iy = 0; iy < this.ny; iy++) {
        const idx = iz * this.ny + iy;
        // Only fill if within Z range of stock
        if (cellZ >= minZ && cellZ <= maxZ) {
          this.xGrid.segments[idx] = new Float32Array(xSeg);
        } else {
          this.xGrid.segments[idx] = new Float32Array(0);
        }
      }
    }

    // Y-grid (XZ plane, rays along Y): each ray gets [bbox.minY, bbox.maxY]
    const ySeg = new Float32Array([bbox.minY, bbox.maxY]);
    for (let iz = 0; iz < this.nz; iz++) {
      const cellZ = bbox.minZ + (iz + 0.5) * this.resolution;
      for (let ix = 0; ix < this.nx; ix++) {
        const idx = iz * this.nx + ix;
        if (cellZ >= minZ && cellZ <= maxZ) {
          this.yGrid.segments[idx] = new Float32Array(ySeg);
        } else {
          this.yGrid.segments[idx] = new Float32Array(0);
        }
      }
    }
  }

  /**
   * Initialize from an STL mesh by ray casting in all 3 directions.
   */
  initFromSTL(vertices: Float32Array): void {
    const triCount = vertices.length / 9;

    // Z-grid: cast Z-rays
    for (let iy = 0; iy < this.ny; iy++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const rayX = this.bbox.minX + (ix + 0.5) * this.resolution;
        const rayY = this.bbox.minY + (iy + 0.5) * this.resolution;
        const hits: number[] = [];
        for (let t = 0; t < triCount; t++) {
          const base = t * 9;
          const z = rayTriangleIntersectZ(
            rayX, rayY,
            vertices[base], vertices[base + 1], vertices[base + 2],
            vertices[base + 3], vertices[base + 4], vertices[base + 5],
            vertices[base + 6], vertices[base + 7], vertices[base + 8]
          );
          if (z !== null) hits.push(z);
        }
        this.zGrid.segments[iy * this.nx + ix] = hitsToSegments(hits);
      }
    }

    // X-grid: cast X-rays (YZ plane)
    for (let iz = 0; iz < this.nz; iz++) {
      for (let iy = 0; iy < this.ny; iy++) {
        const rayY = this.bbox.minY + (iy + 0.5) * this.resolution;
        const rayZ = this.bbox.minZ + (iz + 0.5) * this.resolution;
        const hits: number[] = [];
        for (let t = 0; t < triCount; t++) {
          const base = t * 9;
          const x = rayTriangleIntersectAxis(
            rayY, rayZ,
            vertices[base + 1], vertices[base + 2], vertices[base],
            vertices[base + 4], vertices[base + 5], vertices[base + 3],
            vertices[base + 7], vertices[base + 8], vertices[base + 6]
          );
          if (x !== null) hits.push(x);
        }
        this.xGrid.segments[iz * this.ny + iy] = hitsToSegments(hits);
      }
    }

    // Y-grid: cast Y-rays (XZ plane)
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const rayX = this.bbox.minX + (ix + 0.5) * this.resolution;
        const rayZ = this.bbox.minZ + (iz + 0.5) * this.resolution;
        const hits: number[] = [];
        for (let t = 0; t < triCount; t++) {
          const base = t * 9;
          const y = rayTriangleIntersectAxis(
            rayX, rayZ,
            vertices[base], vertices[base + 2], vertices[base + 1],
            vertices[base + 3], vertices[base + 5], vertices[base + 4],
            vertices[base + 6], vertices[base + 8], vertices[base + 7]
          );
          if (y !== null) hits.push(y);
        }
        this.yGrid.segments[iz * this.nx + ix] = hitsToSegments(hits);
      }
    }
  }

  /**
   * Subtract a tool swept volume from all 3 dexel grids.
   * Tool moves linearly from p0 to p1 (3-axis, vertical tool).
   */
  subtractToolLinear(
    p0x: number, p0y: number, p0z: number,
    p1x: number, p1y: number, p1z: number,
    toolRadius: number,
    cornerRadius: number,
    toolLength: number
  ): void {
    this.subtractToolZ(p0x, p0y, p0z, p1x, p1y, p1z, toolRadius, cornerRadius, toolLength);
    this.subtractToolX(p0x, p0y, p0z, p1x, p1y, p1z, toolRadius, cornerRadius, toolLength);
    this.subtractToolY(p0x, p0y, p0z, p1x, p1y, p1z, toolRadius, cornerRadius, toolLength);
  }

  /**
   * 5-axis tool subtraction using sphere decomposition.
   * The tool is decomposed into spheres along the tilted axis.
   * For ball end mills this is exact; for flat/bull_nose it's an approximation.
   */
  subtractToolLinear5Axis(
    p0x: number, p0y: number, p0z: number,
    p1x: number, p1y: number, p1z: number,
    ai0: number, aj0: number, ak0: number,
    ai1: number, aj1: number, ak1: number,
    toolRadius: number,
    cornerRadius: number,
    fluteLength: number
  ): void {
    // Number of path samples
    const dx = p1x - p0x, dy = p1y - p0y, dz = p1z - p0z;
    const pathLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const pathSteps = Math.max(1, Math.ceil(pathLen / (toolRadius * 0.5)));

    // Number of spheres along tool axis
    const sphereR = cornerRadius > 0 ? Math.min(cornerRadius, toolRadius) : toolRadius * 0.4;
    const axisSteps = Math.max(2, Math.ceil(fluteLength / (sphereR * 0.8)));

    for (let ps = 0; ps <= pathSteps; ps++) {
      const t = ps / pathSteps;
      const px = p0x + t * dx;
      const py = p0y + t * dy;
      const pz = p0z + t * dz;
      // Interpolate axis direction
      const ai = ai0 + t * (ai1 - ai0);
      const aj = aj0 + t * (aj1 - aj0);
      const ak = ak0 + t * (ak1 - ak0);
      // Normalize
      const aLen = Math.sqrt(ai * ai + aj * aj + ak * ak);
      const nai = ai / aLen, naj = aj / aLen, nak = ak / aLen;

      // Place spheres along the tool axis
      for (let as = 0; as <= axisSteps; as++) {
        const h = (as / axisSteps) * fluteLength;
        // Tool cross-section radius at height h
        const rAtH = toolRadiusAtHeightExported(h, toolRadius, cornerRadius, fluteLength);
        if (rAtH <= 0) continue;

        // Sphere center
        const sx = px + nai * h;
        const sy = py + naj * h;
        const sz = pz + nak * h;

        // Subtract sphere from all 3 grids
        this.subtractSphere(sx, sy, sz, rAtH);
      }
    }
  }

  /**
   * Subtract a sphere from all 3 dexel grids.
   */
  private subtractSphere(cx: number, cy: number, cz: number, r: number): void {
    const cs = this.resolution;

    // Z-grid: for each (ix,iy), compute Z interval intersected by sphere
    {
      const ix0 = Math.max(0, Math.floor((cx - r - this.bbox.minX) / cs));
      const ix1 = Math.min(this.nx - 1, Math.floor((cx + r - this.bbox.minX) / cs));
      const iy0 = Math.max(0, Math.floor((cy - r - this.bbox.minY) / cs));
      const iy1 = Math.min(this.ny - 1, Math.floor((cy + r - this.bbox.minY) / cs));
      for (let iy = iy0; iy <= iy1; iy++) {
        const cellY = this.bbox.minY + (iy + 0.5) * cs;
        const dy = cellY - cy;
        for (let ix = ix0; ix <= ix1; ix++) {
          const cellX = this.bbox.minX + (ix + 0.5) * cs;
          const dxx = cellX - cx;
          const d2 = dxx * dxx + dy * dy;
          if (d2 >= r * r) continue;
          const hz = Math.sqrt(r * r - d2);
          const ci = iy * this.nx + ix;
          this.zGrid.segments[ci] = subtractInterval(
            this.zGrid.segments[ci], cz - hz, cz + hz);
        }
      }
    }
    // X-grid
    {
      const iy0 = Math.max(0, Math.floor((cy - r - this.bbox.minY) / cs));
      const iy1 = Math.min(this.ny - 1, Math.floor((cy + r - this.bbox.minY) / cs));
      const iz0 = Math.max(0, Math.floor((cz - r - this.bbox.minZ) / cs));
      const iz1 = Math.min(this.nz - 1, Math.floor((cz + r - this.bbox.minZ) / cs));
      for (let iz = iz0; iz <= iz1; iz++) {
        const cellZ = this.bbox.minZ + (iz + 0.5) * cs;
        const dz = cellZ - cz;
        for (let iy = iy0; iy <= iy1; iy++) {
          const cellY = this.bbox.minY + (iy + 0.5) * cs;
          const dy = cellY - cy;
          const d2 = dy * dy + dz * dz;
          if (d2 >= r * r) continue;
          const hx = Math.sqrt(r * r - d2);
          const ci = iz * this.ny + iy;
          this.xGrid.segments[ci] = subtractInterval(
            this.xGrid.segments[ci], cx - hx, cx + hx);
        }
      }
    }
    // Y-grid
    {
      const ix0 = Math.max(0, Math.floor((cx - r - this.bbox.minX) / cs));
      const ix1 = Math.min(this.nx - 1, Math.floor((cx + r - this.bbox.minX) / cs));
      const iz0 = Math.max(0, Math.floor((cz - r - this.bbox.minZ) / cs));
      const iz1 = Math.min(this.nz - 1, Math.floor((cz + r - this.bbox.minZ) / cs));
      for (let iz = iz0; iz <= iz1; iz++) {
        const cellZ = this.bbox.minZ + (iz + 0.5) * cs;
        const dz = cellZ - cz;
        for (let ix = ix0; ix <= ix1; ix++) {
          const cellX = this.bbox.minX + (ix + 0.5) * cs;
          const dxx = cellX - cx;
          const d2 = dxx * dxx + dz * dz;
          if (d2 >= r * r) continue;
          const hy = Math.sqrt(r * r - d2);
          const ci = iz * this.nx + ix;
          this.yGrid.segments[ci] = subtractInterval(
            this.yGrid.segments[ci], cy - hy, cy + hy);
        }
      }
    }
  }

  /**
   * Z-grid subtraction (existing logic): for each XY cell, compute Z cut interval.
   */
  private subtractToolZ(
    p0x: number, p0y: number, p0z: number,
    p1x: number, p1y: number, p1z: number,
    toolRadius: number, cornerRadius: number, toolLength: number
  ): void {
    const { nx, ny, originX, originY, cellSize } = this.zGrid;

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

        const cutInterval = computeToolCutIntervalZ(
          cellX, cellY,
          p0x, p0y, p0z, p1x, p1y, p1z,
          toolRadius, cornerRadius, toolLength
        );

        if (cutInterval) {
          this.zGrid.segments[cellIdx] = subtractInterval(
            this.zGrid.segments[cellIdx],
            cutInterval[0], cutInterval[1]
          );
        }
      }
    }
  }

  /**
   * X-grid subtraction: for each (Y, Z) cell, compute X interval cut by tool.
   */
  private subtractToolX(
    p0x: number, p0y: number, p0z: number,
    p1x: number, p1y: number, p1z: number,
    toolRadius: number, cornerRadius: number, toolLength: number
  ): void {
    const { cellSize } = this.zGrid;

    const sweptMinY = Math.min(p0y, p1y) - toolRadius;
    const sweptMaxY = Math.max(p0y, p1y) + toolRadius;
    const sweptMinZ = Math.min(p0z, p1z) - cornerRadius; // tool tip can be lower
    const sweptMaxZ = Math.max(p0z, p1z) + toolLength;

    const iy0 = Math.max(0, Math.floor((sweptMinY - this.bbox.minY) / cellSize));
    const iy1 = Math.min(this.ny - 1, Math.floor((sweptMaxY - this.bbox.minY) / cellSize));
    const iz0 = Math.max(0, Math.floor((sweptMinZ - this.bbox.minZ) / cellSize));
    const iz1 = Math.min(this.nz - 1, Math.floor((sweptMaxZ - this.bbox.minZ) / cellSize));

    for (let iz = iz0; iz <= iz1; iz++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const cellIdx = iz * this.ny + iy;
        const cellY = this.bbox.minY + (iy + 0.5) * cellSize;
        const cellZ = this.bbox.minZ + (iz + 0.5) * cellSize;

        const cutInterval = computeToolCutIntervalSide(
          cellY, cellZ,
          p0y, p0z, p0x, p1y, p1z, p1x,
          toolRadius, cornerRadius, toolLength
        );

        if (cutInterval) {
          this.xGrid.segments[cellIdx] = subtractInterval(
            this.xGrid.segments[cellIdx],
            cutInterval[0], cutInterval[1]
          );
        }
      }
    }
  }

  /**
   * Y-grid subtraction: for each (X, Z) cell, compute Y interval cut by tool.
   */
  private subtractToolY(
    p0x: number, p0y: number, p0z: number,
    p1x: number, p1y: number, p1z: number,
    toolRadius: number, cornerRadius: number, toolLength: number
  ): void {
    const { cellSize } = this.zGrid;

    const sweptMinX = Math.min(p0x, p1x) - toolRadius;
    const sweptMaxX = Math.max(p0x, p1x) + toolRadius;
    const sweptMinZ = Math.min(p0z, p1z) - cornerRadius;
    const sweptMaxZ = Math.max(p0z, p1z) + toolLength;

    const ix0 = Math.max(0, Math.floor((sweptMinX - this.bbox.minX) / cellSize));
    const ix1 = Math.min(this.nx - 1, Math.floor((sweptMaxX - this.bbox.minX) / cellSize));
    const iz0 = Math.max(0, Math.floor((sweptMinZ - this.bbox.minZ) / cellSize));
    const iz1 = Math.min(this.nz - 1, Math.floor((sweptMaxZ - this.bbox.minZ) / cellSize));

    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const cellIdx = iz * this.nx + ix;
        const cellX = this.bbox.minX + (ix + 0.5) * cellSize;
        const cellZ = this.bbox.minZ + (iz + 0.5) * cellSize;

        const cutInterval = computeToolCutIntervalSide(
          cellX, cellZ,
          p0x, p0z, p0y, p1x, p1z, p1y,
          toolRadius, cornerRadius, toolLength
        );

        if (cutInterval) {
          this.yGrid.segments[cellIdx] = subtractInterval(
            this.yGrid.segments[cellIdx],
            cutInterval[0], cutInterval[1]
          );
        }
      }
    }
  }

  /** Get top Z at grid cell (for Z-grid heightmap) */
  getTopZ(ix: number, iy: number): number | null {
    const seg = this.zGrid.segments[iy * this.zGrid.nx + ix];
    if (!seg || seg.length === 0) return null;
    return seg[seg.length - 1];
  }

  /** Get bottom Z at grid cell */
  getBottomZ(ix: number, iy: number): number | null {
    const seg = this.zGrid.segments[iy * this.zGrid.nx + ix];
    if (!seg || seg.length === 0) return null;
    return seg[0];
  }

  /** Check if a Z-grid cell has material */
  hasMaterial(ix: number, iy: number): boolean {
    const seg = this.zGrid.segments[iy * this.zGrid.nx + ix];
    return seg !== undefined && seg.length > 0;
  }

  /** Get the max X value at (iy, iz) from xGrid — "rightmost" surface */
  getMaxX(iy: number, iz: number): number | null {
    const seg = this.xGrid.segments[iz * this.ny + iy];
    if (!seg || seg.length === 0) return null;
    return seg[seg.length - 1];
  }

  /** Get the min X value at (iy, iz) from xGrid — "leftmost" surface */
  getMinX(iy: number, iz: number): number | null {
    const seg = this.xGrid.segments[iz * this.ny + iy];
    if (!seg || seg.length === 0) return null;
    return seg[0];
  }

  /** Get the max Y value at (ix, iz) from yGrid */
  getMaxY(ix: number, iz: number): number | null {
    const seg = this.yGrid.segments[iz * this.nx + ix];
    if (!seg || seg.length === 0) return null;
    return seg[seg.length - 1];
  }

  /** Get the min Y value at (ix, iz) from yGrid */
  getMinY(ix: number, iz: number): number | null {
    const seg = this.yGrid.segments[iz * this.nx + ix];
    if (!seg || seg.length === 0) return null;
    return seg[0];
  }

  /** Check if xGrid cell has material */
  hasXMaterial(iy: number, iz: number): boolean {
    const seg = this.xGrid.segments[iz * this.ny + iy];
    return seg !== undefined && seg.length > 0;
  }

  /** Check if yGrid cell has material */
  hasYMaterial(ix: number, iz: number): boolean {
    const seg = this.yGrid.segments[iz * this.nx + ix];
    return seg !== undefined && seg.length > 0;
  }

  /** Compute total material volume (average of 3 grids for better accuracy) */
  computeVolume(): number {
    const cs = this.resolution;
    const area = cs * cs;
    let volume = 0;
    // Use Z-grid for volume (most reliable for typical 3-axis machining)
    const total = this.nx * this.ny;
    for (let i = 0; i < total; i++) {
      const seg = this.zGrid.segments[i];
      for (let k = 0; k + 1 < seg.length; k += 2) {
        volume += (seg[k + 1] - seg[k]) * area;
      }
    }
    return volume;
  }

  /** Clone this model (all 3 grids) */
  clone(): DexelModel {
    const copy = new DexelModel(this.bbox, this.resolution);

    for (let i = 0; i < this.nx * this.ny; i++) {
      copy.zGrid.segments[i] = new Float32Array(this.zGrid.segments[i]);
    }
    for (let i = 0; i < this.ny * this.nz; i++) {
      copy.xGrid.segments[i] = new Float32Array(this.xGrid.segments[i]);
    }
    for (let i = 0; i < this.nx * this.nz; i++) {
      copy.yGrid.segments[i] = new Float32Array(this.yGrid.segments[i]);
    }

    return copy;
  }

  // Keep backward compat: grid alias for zGrid
  get grid(): DexelGrid {
    return this.zGrid;
  }
}

// =====================================================================
// Helper Functions
// =====================================================================

/** Convert sorted hit list to segment pairs */
function hitsToSegments(hits: number[]): Float32Array {
  if (hits.length < 2) return new Float32Array(0);
  hits.sort((a, b) => a - b);
  const segs: number[] = [];
  for (let k = 0; k + 1 < hits.length; k += 2) {
    segs.push(hits[k], hits[k + 1]);
  }
  return new Float32Array(segs);
}

/**
 * Ray-Triangle intersection (Z-ray at given X,Y).
 * Returns Z value of intersection or null.
 */
function rayTriangleIntersectZ(
  rx: number, ry: number,
  v0x: number, v0y: number, v0z: number,
  v1x: number, v1y: number, v1z: number,
  v2x: number, v2y: number, v2z: number
): number | null {
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

  return v0z + u * (v1z - v0z) + v * (v2z - v0z);
}

/**
 * Generic axis-aligned ray intersection.
 * Cast ray at (ra, rb) along the third axis.
 * v0a,v0b,v0c are the two "plane" coords and the "ray" coord of vertex 0, etc.
 */
function rayTriangleIntersectAxis(
  ra: number, rb: number,
  v0a: number, v0b: number, v0c: number,
  v1a: number, v1b: number, v1c: number,
  v2a: number, v2b: number, v2c: number
): number | null {
  const d00a = v1a - v0a, d00b = v1b - v0b;
  const d01a = v2a - v0a, d01b = v2b - v0b;
  const d02a = ra - v0a, d02b = rb - v0b;

  const dot00 = d00a * d00a + d00b * d00b;
  const dot01 = d00a * d01a + d00b * d01b;
  const dot02 = d00a * d02a + d00b * d02b;
  const dot11 = d01a * d01a + d01b * d01b;
  const dot12 = d01a * d02a + d01b * d02b;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return null;

  const invDenom = 1.0 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  if (u < -1e-6 || v < -1e-6 || u + v > 1.0 + 1e-6) return null;

  return v0c + u * (v1c - v0c) + v * (v2c - v0c);
}

/**
 * Tool profile radius at a given height above tool tip.
 * Returns the cross-section radius of the tool at height h above tip.
 *   flat:      R for 0 <= h <= fluteLength
 *   ball:      sqrt(R² - (R-h)²) for h < R, then R for h >= R
 *   bull_nose: depends on torus region
 */
function toolRadiusAtHeightExported(
  h: number, toolRadius: number, cornerRadius: number, fluteLength: number
): number {
  return toolRadiusAtHeight(h, toolRadius, cornerRadius, fluteLength);
}

function toolRadiusAtHeight(
  h: number,
  toolRadius: number,
  cornerRadius: number,
  fluteLength: number
): number {
  if (h < 0 || h > fluteLength) return -1; // outside tool

  if (cornerRadius <= 0) {
    // Flat end mill
    return toolRadius;
  } else if (cornerRadius >= toolRadius - 0.001) {
    // Ball end mill: hemisphere of radius R
    if (h < cornerRadius) {
      // Hemisphere zone
      return Math.sqrt(cornerRadius * cornerRadius - (cornerRadius - h) * (cornerRadius - h));
    }
    return toolRadius;
  } else {
    // Bull nose: torus with major radius = (toolRadius - cornerRadius), minor radius = cornerRadius
    if (h < cornerRadius) {
      // Torus zone
      const flatR = toolRadius - cornerRadius;
      const circleR = Math.sqrt(cornerRadius * cornerRadius - (cornerRadius - h) * (cornerRadius - h));
      return flatR + circleR;
    }
    return toolRadius;
  }
}

/**
 * Compute Z cut interval for a Z-ray at (cellX, cellY).
 * Tool sweeps linearly from p0 to p1.
 */
function computeToolCutIntervalZ(
  cellX: number, cellY: number,
  p0x: number, p0y: number, p0z: number,
  p1x: number, p1y: number, p1z: number,
  toolRadius: number, cornerRadius: number, toolLength: number
): [number, number] | null {
  const dx = p1x - p0x;
  const dy = p1y - p0y;
  const dz = p1z - p0z;
  const lenSq = dx * dx + dy * dy;

  // Sample the path to find the deepest cut at this XY cell
  const steps = Math.max(1, Math.ceil(Math.sqrt(lenSq) / (toolRadius * 0.5)));
  let minBottom = 1e9;
  let found = false;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const sx = p0x + t * dx;
    const sy = p0y + t * dy;
    const sz = p0z + t * dz;

    const sdSq = (cellX - sx) * (cellX - sx) + (cellY - sy) * (cellY - sy);
    if (sdSq > toolRadius * toolRadius) continue;

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

    if (sBottom < minBottom) {
      minBottom = sBottom;
      found = true;
    }
  }

  if (!found) return null;
  return [minBottom, minBottom + toolLength];
}

/**
 * Compute cut interval along a side axis.
 *
 * For X-grid: cellA=cellY, cellB=cellZ, p0a=p0y, p0b=p0z, p0c=p0x, etc.
 * For Y-grid: cellA=cellX, cellB=cellZ, p0a=p0x, p0b=p0z, p0c=p0y, etc.
 *
 * At each sample point along the tool path, we compute the tool profile:
 * the cross-sectional radius at height (cellZ - tipZ), then check if the
 * cell's lateral distance (in the A direction) is within that radius.
 * If so, compute the half-extent in the C (side) direction.
 */
function computeToolCutIntervalSide(
  cellA: number, cellB: number,
  p0a: number, p0b: number, p0c: number,
  p1a: number, p1b: number, p1c: number,
  toolRadius: number, cornerRadius: number, toolLength: number
): [number, number] | null {
  const da = p1a - p0a;
  const db = p1b - p0b;
  const dc = p1c - p0c;
  const lenSq = da * da + dc * dc; // path length in AC plane

  const steps = Math.max(1, Math.ceil(Math.sqrt(lenSq + db * db) / (toolRadius * 0.5)));
  let minC = 1e9;
  let maxC = -1e9;
  let found = false;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const sa = p0a + t * da; // tool center A coord
    const sb = p0b + t * db; // tool tip Z (B coord)
    const sc = p0c + t * dc; // tool center C coord

    // Height of the cell above tool tip
    const h = cellB - sb;
    if (h < 0 || h > toolLength) continue;

    // Tool cross-section radius at this height
    const rAtH = toolRadiusAtHeight(h, toolRadius, cornerRadius, toolLength);
    if (rAtH <= 0) continue;

    // Lateral distance in A direction
    const distA = Math.abs(cellA - sa);
    if (distA > rAtH) continue;

    // Half-extent in C direction: sqrt(rAtH² - distA²)
    const halfC = Math.sqrt(rAtH * rAtH - distA * distA);
    const cLow = sc - halfC;
    const cHigh = sc + halfC;

    if (cLow < minC) minC = cLow;
    if (cHigh > maxC) maxC = cHigh;
    found = true;
  }

  if (!found) return null;
  return [minC, maxC];
}

/**
 * Subtract an interval [cutStart, cutEnd] from a dexel segment list.
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
      result.push(s, e);
    } else if (s >= cutStart && e <= cutEnd) {
      // Fully contained - remove
    } else if (s < cutStart && e > cutEnd) {
      result.push(s, cutStart);
      result.push(cutEnd, e);
    } else if (s < cutStart) {
      result.push(s, cutStart);
    } else {
      result.push(cutEnd, e);
    }
  }

  return new Float32Array(result);
}
