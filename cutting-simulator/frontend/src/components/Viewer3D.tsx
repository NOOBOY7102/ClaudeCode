import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../store/useStore';
import { createToolMesh, createToolpathLines } from '../engine/DexelMesh';

export function Viewer3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const stockMeshRef = useRef<THREE.Mesh | null>(null);
  const toolGroupRef = useRef<THREE.Group | null>(null);
  const toolpathGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);

  const {
    stockMesh: stockGeometry,
    toolPosition,
    currentToolId,
    tools,
    toolpath,
    showToolpath,
    showTool,
    simState,
    tick,
  } = useStore();

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x1a1a2e);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(80, 80, 80);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 5);
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(50, 80, 50);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x88aaff, 0.3);
    dirLight2.position.set(-30, -20, 40);
    scene.add(dirLight2);

    // Grid helper
    const gridHelper = new THREE.GridHelper(100, 20, 0x444466, 0x333355);
    gridHelper.rotation.x = Math.PI / 2; // XY plane
    scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(30);
    scene.add(axesHelper);

    // Handle resize
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // Update stock mesh
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (stockMeshRef.current) {
      scene.remove(stockMeshRef.current);
      stockMeshRef.current.geometry.dispose();
    }

    if (stockGeometry) {
      const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        shininess: 60,
        specular: 0x222222,
      });
      const mesh = new THREE.Mesh(stockGeometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
      stockMeshRef.current = mesh;
    }
  }, [stockGeometry]);

  // Update tool position
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (toolGroupRef.current) {
      scene.remove(toolGroupRef.current);
    }

    if (toolPosition && showTool) {
      const tool = tools.find(t => t.id === currentToolId) ?? tools[0];
      if (tool) {
        const toolMesh = createToolMesh(
          tool.type,
          tool.diameter,
          tool.cornerRadius,
          tool.fluteLength
        );
        toolMesh.position.set(toolPosition.x, toolPosition.y, toolPosition.z);
        scene.add(toolMesh);
        toolGroupRef.current = toolMesh;
      }
    }
  }, [toolPosition, currentToolId, showTool, tools]);

  // Update toolpath lines
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (toolpathGroupRef.current) {
      scene.remove(toolpathGroupRef.current);
    }

    if (showToolpath && toolpath.length > 0) {
      const group = createToolpathLines(toolpath);
      scene.add(group);
      toolpathGroupRef.current = group;
    }
  }, [toolpath, showToolpath]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      // Run simulation steps if playing
      if (simState === 'playing') {
        tick();
      }

      controlsRef.current?.update();

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [simState, tick]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
}
