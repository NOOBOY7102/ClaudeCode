import { useStore } from '../store/useStore';

export function ControlPanel() {
  const {
    simState,
    play,
    pause,
    reset,
    stepOnce,
    stepsPerFrame,
    setStepsPerFrame,
    progressPercent,
    toolPosition,
    currentToolId,
    tools,
    colorMode,
    setColorMode,
    showToolpath,
    setShowToolpath,
    showTool,
    setShowTool,
    resolution,
    setResolution,
  } = useStore();

  const currentTool = tools.find(t => t.id === currentToolId);

  return (
    <div className="control-panel">
      <h2>CNC Cutting Simulator</h2>

      {/* Playback Controls */}
      <div className="section">
        <h3>Playback</h3>
        <div className="button-row">
          {simState === 'playing' ? (
            <button onClick={pause} className="btn btn-warning">
              ⏸ Pause
            </button>
          ) : (
            <button
              onClick={play}
              className="btn btn-primary"
              disabled={simState === 'finished'}
            >
              ▶ Play
            </button>
          )}
          <button onClick={stepOnce} className="btn btn-secondary" disabled={simState === 'playing' || simState === 'finished'}>
            ⏭ Step
          </button>
          <button onClick={reset} className="btn btn-danger">
            ↺ Reset
          </button>
        </div>
        <div className="slider-row">
          <label>Speed: {stepsPerFrame}x</label>
          <input
            type="range"
            min="1"
            max="50"
            value={stepsPerFrame}
            onChange={e => setStepsPerFrame(parseInt(e.target.value))}
          />
        </div>
      </div>

      {/* Progress */}
      <div className="section">
        <h3>Progress</h3>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, progressPercent)}%` }}
          />
        </div>
        <div className="info-text">{progressPercent.toFixed(1)}%</div>
        {simState === 'finished' && (
          <div className="info-text status-done">Simulation Complete</div>
        )}
      </div>

      {/* Current Tool */}
      <div className="section">
        <h3>Current Tool</h3>
        {currentTool ? (
          <div className="tool-info">
            <div className="tool-name">{currentTool.name}</div>
            <div className="tool-detail">Type: {currentTool.type}</div>
            <div className="tool-detail">Diameter: {currentTool.diameter}mm</div>
            {currentTool.cornerRadius > 0 && (
              <div className="tool-detail">Corner R: {currentTool.cornerRadius}mm</div>
            )}
          </div>
        ) : (
          <div className="info-text">No tool selected</div>
        )}
      </div>

      {/* Tool Position */}
      {toolPosition && (
        <div className="section">
          <h3>Tool Position</h3>
          <div className="position-grid">
            <span className="axis-label x">X</span>
            <span className="axis-value">{toolPosition.x.toFixed(2)}</span>
            <span className="axis-label y">Y</span>
            <span className="axis-value">{toolPosition.y.toFixed(2)}</span>
            <span className="axis-label z">Z</span>
            <span className="axis-value">{toolPosition.z.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Tool Library */}
      <div className="section">
        <h3>Tool Library</h3>
        <div className="tool-list">
          {tools.map(t => (
            <div
              key={t.id}
              className={`tool-item ${t.id === currentToolId ? 'active' : ''}`}
            >
              <span className="tool-id">{t.id}</span>
              <span className="tool-label">{t.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Visualization */}
      <div className="section">
        <h3>Visualization</h3>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="colorMode"
              checked={colorMode === 'solid'}
              onChange={() => setColorMode('solid')}
            />
            Solid
          </label>
          <label>
            <input
              type="radio"
              name="colorMode"
              checked={colorMode === 'heightmap'}
              onChange={() => setColorMode('heightmap')}
            />
            Height Map
          </label>
          <label>
            <input
              type="radio"
              name="colorMode"
              checked={colorMode === 'difference'}
              onChange={() => setColorMode('difference')}
            />
            Difference
          </label>
        </div>
        <div className="checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={showToolpath}
              onChange={e => setShowToolpath(e.target.checked)}
            />
            Show Toolpath
          </label>
          <label>
            <input
              type="checkbox"
              checked={showTool}
              onChange={e => setShowTool(e.target.checked)}
            />
            Show Tool
          </label>
        </div>
      </div>

      {/* Settings */}
      <div className="section">
        <h3>Settings</h3>
        <div className="slider-row">
          <label>Resolution: {resolution}mm</label>
          <input
            type="range"
            min="0.3"
            max="2.0"
            step="0.1"
            value={resolution}
            onChange={e => setResolution(parseFloat(e.target.value))}
          />
        </div>
        <div className="info-text hint">
          Lower = more detail, slower
        </div>
      </div>

      {/* File Upload */}
      <div className="section">
        <h3>Load G-code</h3>
        <input
          type="file"
          accept=".nc,.gcode,.tap,.ngc,.txt"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => {
                const text = reader.result as string;
                useStore.getState().loadGCode(text);
              };
              reader.readAsText(file);
            }
          }}
          className="file-input"
        />
      </div>
    </div>
  );
}
