import type { ToolDefinition, BBox } from '../types';

// === Default Tools ===
export const defaultTools: ToolDefinition[] = [
  {
    id: 'T1',
    name: 'φ10 Flat End Mill',
    type: 'flat',
    diameter: 10,
    cornerRadius: 0,
    fluteLength: 25,
    shankDiameter: 10,
    totalLength: 75,
  },
  {
    id: 'T2',
    name: 'φ6 Ball End Mill',
    type: 'ball',
    diameter: 6,
    cornerRadius: 3,
    fluteLength: 20,
    shankDiameter: 6,
    totalLength: 60,
  },
  {
    id: 'T3',
    name: 'φ8 R1 Bull Nose',
    type: 'bull_nose',
    diameter: 8,
    cornerRadius: 1,
    fluteLength: 22,
    shankDiameter: 8,
    totalLength: 65,
  },
];

// === Default Stock ===
export const defaultStock: BBox = {
  minX: -40,
  maxX: 40,
  minY: -40,
  maxY: 40,
  minZ: -10,
  maxZ: 20,
};

// === Generate Demo G-code ===
export function getDefaultGCode(): string {
  // Multi-tool demo: roughing with flat, finishing with ball
  const lines: string[] = [
    '(=== Cutting Simulation Demo ===)',
    '(Roughing with T1: Flat End Mill)',
    'G90 G21',
    'T1 M6',
    'M3 S12000',
    'G0 Z30',
    '',
  ];

  // Roughing: zigzag layers
  const toolR = 5; // T1 radius
  const stepover = toolR * 1.4; // 70% stepover
  const safeZ = 25;
  const layers = [17, 14, 11, 8]; // cut to these Z levels

  for (const cutZ of layers) {
    let forward = true;
    for (let y = -35; y <= 35; y += stepover) {
      const x0 = forward ? -35 : 35;
      const x1 = forward ? 35 : -35;
      lines.push(`G0 X${x0.toFixed(1)} Y${y.toFixed(1)}`);
      lines.push(`G0 Z${(cutZ + 2).toFixed(1)}`);
      lines.push(`G1 Z${cutZ.toFixed(1)} F300`);
      lines.push(`G1 X${x1.toFixed(1)} F2000`);
      lines.push(`G0 Z${safeZ}`);
      forward = !forward;
    }
  }

  // Semi-finishing with T3: bull nose
  lines.push('');
  lines.push('(Semi-finishing with T3: Bull Nose)');
  lines.push('T3 M6');
  lines.push('M3 S15000');
  lines.push('G0 Z30');

  const semiStep = 3; // smaller stepover
  for (let y = -35; y <= 35; y += semiStep) {
    const forward = (Math.round((y + 35) / semiStep) % 2) === 0;
    const x0 = forward ? -35 : 35;
    const x1 = forward ? 35 : -35;
    lines.push(`G0 X${x0.toFixed(1)} Y${y.toFixed(1)}`);
    lines.push(`G0 Z7`);
    lines.push(`G1 Z5 F200`);
    lines.push(`G1 X${x1.toFixed(1)} F1200`);
    lines.push(`G0 Z${safeZ}`);
  }

  // Finishing with T2: ball end mill - concentric circles (pocket)
  lines.push('');
  lines.push('(Finishing with T2: Ball End Mill)');
  lines.push('T2 M6');
  lines.push('M3 S18000');
  lines.push('G0 Z30');

  const finishStep = 0.5;
  const finishZ = 3;
  for (let r = 2; r <= 30; r += finishStep) {
    // Move to start of circle
    lines.push(`G0 X${r.toFixed(1)} Y0`);
    lines.push(`G1 Z${finishZ.toFixed(1)} F150`);
    // Full circle arc
    lines.push(`G2 X${r.toFixed(1)} Y0 I${(-r).toFixed(1)} J0 F600`);
    lines.push(`G0 Z${safeZ}`);
  }

  lines.push('');
  lines.push('G0 Z50');
  lines.push('M5');
  lines.push('M30');

  return lines.join('\n');
}

/**
 * Generate vertices for a simple dome target shape (for difference comparison)
 * Returns a function that gives the target Z height at any XY point
 */
export function getDomeTargetHeight(
  cx: number, cy: number, radius: number,
  baseZ: number, topZ: number
): (x: number, y: number) => number {
  return (x: number, y: number) => {
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (dist >= radius) return baseZ;
    const t = 1 - (dist / radius);
    return baseZ + (topZ - baseZ) * Math.sqrt(t);
  };
}
