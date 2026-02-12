import { DexelModel } from './DexelModel';
import type { ToolDefinition, ToolpathSegment, SimulationProgress } from '../types';

export interface SimStepResult {
  toolX: number;
  toolY: number;
  toolZ: number;
  toolId: string;
  done: boolean;
  progress: SimulationProgress;
  // 5-axis tool orientation
  toolAi?: number;
  toolAj?: number;
  toolAk?: number;
}

/**
 * Runs the cutting simulation step by step.
 * Each call to step() processes one toolpath point and subtracts material.
 */
export class SimulationRunner {
  private segIdx = 0;
  private ptIdx = 0;
  private prevX = 0;
  private prevY = 0;
  private prevZ = 50;
  private prevAi = 0;
  private prevAj = 0;
  private prevAk = 1;
  private totalPoints: number;
  private processedPoints = 0;
  private initialVolume: number;
  private stepsPerFrame: number;
  private dexelModel: DexelModel;
  private toolpath: ToolpathSegment[];
  private tools: Map<string, ToolDefinition>;

  constructor(
    dexelModel: DexelModel,
    toolpath: ToolpathSegment[],
    tools: Map<string, ToolDefinition>,
    stepsPerFrame = 5
  ) {
    this.dexelModel = dexelModel;
    this.toolpath = toolpath;
    this.tools = tools;
    this.totalPoints = toolpath.reduce((sum, seg) => sum + seg.points.length, 0);
    this.initialVolume = dexelModel.computeVolume();
    this.stepsPerFrame = stepsPerFrame;

    if (toolpath.length > 0 && toolpath[0].points.length > 0) {
      const p0 = toolpath[0].points[0];
      this.prevX = p0.x;
      this.prevY = p0.y;
      this.prevZ = p0.z;
      this.prevAi = p0.ai ?? 0;
      this.prevAj = p0.aj ?? 0;
      this.prevAk = p0.ak ?? 1;
    }
  }

  stepFrame(): SimStepResult {
    let result: SimStepResult | null = null;
    for (let i = 0; i < this.stepsPerFrame; i++) {
      result = this.stepOne();
      if (result.done) break;
    }
    return result!;
  }

  private stepOne(): SimStepResult {
    if (this.segIdx >= this.toolpath.length) {
      return this.makeResult(true);
    }

    const seg = this.toolpath[this.segIdx];
    if (this.ptIdx >= seg.points.length) {
      this.segIdx++;
      this.ptIdx = 0;
      if (this.segIdx >= this.toolpath.length) {
        return this.makeResult(true);
      }
    }

    const point = this.toolpath[this.segIdx].points[this.ptIdx];
    const tool = this.tools.get(this.toolpath[this.segIdx].toolId);

    if (tool && point.type !== 'rapid') {
      const is5axis = point.ai !== undefined;

      if (is5axis) {
        // 5-axis: use sphere decomposition
        this.dexelModel.subtractToolLinear5Axis(
          this.prevX, this.prevY, this.prevZ,
          point.x, point.y, point.z,
          this.prevAi, this.prevAj, this.prevAk,
          point.ai!, point.aj!, point.ak!,
          tool.diameter / 2,
          tool.cornerRadius,
          tool.fluteLength
        );
      } else {
        // 3-axis: use existing fast method
        this.dexelModel.subtractToolLinear(
          this.prevX, this.prevY, this.prevZ,
          point.x, point.y, point.z,
          tool.diameter / 2,
          tool.cornerRadius,
          tool.fluteLength
        );
      }
    }

    this.prevX = point.x;
    this.prevY = point.y;
    this.prevZ = point.z;
    this.prevAi = point.ai ?? 0;
    this.prevAj = point.aj ?? 0;
    this.prevAk = point.ak ?? 1;
    this.ptIdx++;
    this.processedPoints++;

    return this.makeResult(false);
  }

  private makeResult(done: boolean): SimStepResult {
    const currentVolume = done ? this.dexelModel.computeVolume() : -1;
    return {
      toolX: this.prevX,
      toolY: this.prevY,
      toolZ: this.prevZ,
      toolId: this.segIdx < this.toolpath.length
        ? this.toolpath[this.segIdx].toolId
        : '',
      done,
      toolAi: this.prevAi,
      toolAj: this.prevAj,
      toolAk: this.prevAk,
      progress: {
        currentSegmentIndex: this.segIdx,
        currentPointIndex: this.ptIdx,
        totalPoints: this.totalPoints,
        elapsedTime: 0,
        materialRemoved: done
          ? ((1 - currentVolume / this.initialVolume) * 100)
          : (this.processedPoints / this.totalPoints * 100),
      },
    };
  }

  reset(freshModel: DexelModel): void {
    this.segIdx = 0;
    this.ptIdx = 0;
    this.processedPoints = 0;
    this.dexelModel = freshModel;
    this.initialVolume = freshModel.computeVolume();

    if (this.toolpath.length > 0 && this.toolpath[0].points.length > 0) {
      const p0 = this.toolpath[0].points[0];
      this.prevX = p0.x;
      this.prevY = p0.y;
      this.prevZ = p0.z;
      this.prevAi = p0.ai ?? 0;
      this.prevAj = p0.aj ?? 0;
      this.prevAk = p0.ak ?? 1;
    }
  }

  get model(): DexelModel {
    return this.dexelModel;
  }

  setStepsPerFrame(n: number): void {
    this.stepsPerFrame = Math.max(1, n);
  }

  isDone(): boolean {
    return this.segIdx >= this.toolpath.length;
  }
}
