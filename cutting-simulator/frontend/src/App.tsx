import { useEffect } from 'react';
import { Viewer3D } from './components/Viewer3D';
import { ControlPanel } from './components/ControlPanel';
import { useStore } from './store/useStore';
import './App.css';

function App() {
  const initialize = useStore(s => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="app-container">
      <div className="viewer-container">
        <Viewer3D />
      </div>
      <div className="panel-container">
        <ControlPanel />
      </div>
    </div>
  );
}

export default App;
