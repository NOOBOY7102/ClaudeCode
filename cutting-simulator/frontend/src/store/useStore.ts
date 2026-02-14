import { create } from 'zustand';
import { DexelModel } from '../engine/DexelModel';
import { SimulationRunner } from '../engine/SimulationRunner';
import { parseGCode } from '../engine/GCodeParser';
import { dexelToMesh } from '../engine/DexelMesh';
import { defaultTools, defaultStock, getDefaultGCode } from '../engine/SampleData';
import { buildTargetModel } from '../engine/TargetShape';
import type { ToolDefinition, ToolpathSegment, SimState, BBox } from '../types';
import * as THREE from 'three';

interface AppState {
  // Models
  stockBBox: BBox;
  resolution: number;
  dexelModel: DexelModel | null;
  initialModel: DexelModel | null;  // for reset
  tools: ToolDefinition[];
  toolpath: ToolpathSegment[];
  gcodeText: string;

  // Simulation
  simState: SimState;
  runner: SimulationRunner | null;
  stepsPerFrame: number;
  toolPosition: { x: number; y: number; z: number } | null;
  toolAxis: { ai: number; aj: number; ak: number } | null;
  currentToolId: string;
  progressPercent: number;

  // Visualization
  colorMode: 'solid' | 'heightmap' | 'difference';
  showToolpath: boolean;
  showTool: boolean;
  showStock: boolean;
  showTarget: boolean;

  // Three.js objects (managed externally by Viewer)
  stockMesh: THREE.BufferGeometry | null;
  targetMesh: THREE.BufferGeometry | null;

  // Actions
  initialize: () => void;
  loadGCode: (text: string) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  stepOnce: () => void;
  setStepsPerFrame: (n: number) => void;
  setColorMode: (mode: 'solid' | 'heightmap' | 'difference') => void;
  setShowToolpath: (v: boolean) => void;
  setShowTool: (v: boolean) => void;
  setShowTarget: (v: boolean) => void;
  setResolution: (r: number) => void;
  tick: () => boolean; // returns true if simulation updated
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  stockBBox: defaultStock,
  resolution: 0.5,
  dexelModel: null,
  initialModel: null,
  tools: defaultTools,
  toolpath: [],
  gcodeText: '',
  simState: 'idle',
  runner: null,
  stepsPerFrame: 8,
  toolPosition: null,
  toolAxis: null,
  currentToolId: 'T1',
  progressPercent: 0,
  colorMode: 'solid',
  showToolpath: true,
  showTool: true,
  showStock: true,
  showTarget: false,
  stockMesh: null,
  targetMesh: null,

  initialize: () => {
    const state = get();
    const bbox = state.stockBBox;
    const res = state.resolution;

    // Create dexel model from stock bbox
    const model = new DexelModel(bbox, res);
    model.initAsBlock(bbox.minZ, bbox.maxZ);
    const initial = model.clone();

    // Parse default G-code
    const gcode = getDefaultGCode();
    const toolIds = state.tools.map(t => t.id);
    const toolpath = parseGCode(gcode, toolIds);

    // Create tool map
    const toolMap = new Map<string, ToolDefinition>();
    for (const t of state.tools) {
      toolMap.set(t.id, t);
    }

    const runner = new SimulationRunner(model, toolpath, toolMap, state.stepsPerFrame);

    // Generate initial mesh
    const mesh = dexelToMesh(model, state.colorMode);

    // Build target shape model and mesh
    const target = buildTargetModel(bbox, res);
    const tMesh = dexelToMesh(target, 'solid');

    set({
      dexelModel: model,
      initialModel: initial,
      toolpath,
      gcodeText: gcode,
      runner,
      simState: 'idle',
      stockMesh: mesh,
      targetMesh: tMesh,
      progressPercent: 0,
      toolPosition: null,
      toolAxis: null,
    });
  },

  loadGCode: (text: string) => {
    const state = get();
    const toolIds = state.tools.map(t => t.id);
    const toolpath = parseGCode(text, toolIds);

    // Reset model
    const bbox = state.stockBBox;
    const model = new DexelModel(bbox, state.resolution);
    model.initAsBlock(bbox.minZ, bbox.maxZ);
    const initial = model.clone();

    const toolMap = new Map<string, ToolDefinition>();
    for (const t of state.tools) {
      toolMap.set(t.id, t);
    }
    const runner = new SimulationRunner(model, toolpath, toolMap, state.stepsPerFrame);
    const mesh = dexelToMesh(model, state.colorMode);

    set({
      dexelModel: model,
      initialModel: initial,
      toolpath,
      gcodeText: text,
      runner,
      simState: 'idle',
      stockMesh: mesh,
      progressPercent: 0,
      toolPosition: null,
      toolAxis: null,
    });
  },

  play: () => {
    set({ simState: 'playing' });
  },

  pause: () => {
    set({ simState: 'paused' });
  },

  reset: () => {
    const state = get();
    if (!state.initialModel) return;

    const freshModel = state.initialModel.clone();
    const toolMap = new Map<string, ToolDefinition>();
    for (const t of state.tools) {
      toolMap.set(t.id, t);
    }
    const runner = new SimulationRunner(freshModel, state.toolpath, toolMap, state.stepsPerFrame);
    const mesh = dexelToMesh(freshModel, state.colorMode);

    set({
      dexelModel: freshModel,
      runner,
      simState: 'idle',
      stockMesh: mesh,
      progressPercent: 0,
      toolPosition: null,
      toolAxis: null,
    });
  },

  stepOnce: () => {
    const state = get();
    if (!state.runner || state.runner.isDone()) return;

    const result = state.runner.stepFrame();
    const mesh = dexelToMesh(state.runner.model, state.colorMode);

    set({
      stockMesh: mesh,
      toolPosition: { x: result.toolX, y: result.toolY, z: result.toolZ },
      toolAxis: result.toolAi != null
        ? { ai: result.toolAi, aj: result.toolAj!, ak: result.toolAk! }
        : null,
      currentToolId: result.toolId,
      progressPercent: result.progress.materialRemoved,
      simState: result.done ? 'finished' : state.simState,
    });
  },

  setStepsPerFrame: (n: number) => {
    const state = get();
    state.runner?.setStepsPerFrame(n);
    set({ stepsPerFrame: n });
  },

  setColorMode: (mode) => {
    const state = get();
    if (state.dexelModel) {
      const mesh = dexelToMesh(state.dexelModel, mode);
      set({ colorMode: mode, stockMesh: mesh });
    } else {
      set({ colorMode: mode });
    }
  },

  setShowToolpath: (v) => set({ showToolpath: v }),
  setShowTool: (v) => set({ showTool: v }),
  setShowTarget: (v) => set({ showTarget: v }),

  setResolution: (r) => {
    set({ resolution: r });
    // Re-initialize with new resolution
    get().initialize();
  },

  tick: () => {
    const state = get();
    if (state.simState !== 'playing' || !state.runner) return false;
    if (state.runner.isDone()) {
      set({ simState: 'finished' });
      return false;
    }

    const result = state.runner.stepFrame();

    // Only rebuild mesh every few frames for performance
    const mesh = dexelToMesh(state.runner.model, state.colorMode);

    set({
      stockMesh: mesh,
      toolPosition: { x: result.toolX, y: result.toolY, z: result.toolZ },
      toolAxis: result.toolAi != null
        ? { ai: result.toolAi, aj: result.toolAj!, ak: result.toolAk! }
        : null,
      currentToolId: result.toolId,
      progressPercent: result.progress.materialRemoved,
      simState: result.done ? 'finished' : 'playing',
    });

    return true;
  },
}));
