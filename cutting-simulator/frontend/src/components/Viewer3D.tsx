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
  const targetMeshRef = useRef<THREE.Mesh | null>(null);
  const toolGroupRef = useRef<THREE.Group | null>(null);
  const toolpathGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const targetMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  const {
    stockMesh: stockGeometry,
    targetMesh: targetGeometry,
    toolPosition,
    toolAxis,
    currentToolId,
    tools,
    toolpath,
    showToolpath,
    showTool,
    showStock,
    showTarget,
    simState,
    tick,
  } = useStore();

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer with tone mapping for PBR
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x1a1a2e);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Environment map for PBR reflections (procedural)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x444466);
    // Add gradient lights to environment for visible reflections
    const envLight1 = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    envLight1.position.set(0, 0, 80);
    envScene.add(envLight1);
    const envLight2 = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ color: 0x888899, side: THREE.DoubleSide })
    );
    envLight2.position.set(0, 80, 0);
    envLight2.rotation.x = Math.PI / 2;
    envScene.add(envLight2);

    const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
    scene.environment = envMap;
    pmremGenerator.dispose();

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(40, 60, 80);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x8899cc, 0.6);
    dirLight2.position.set(-40, -30, 50);
    scene.add(dirLight2);

    // Rim light from below for edge definition
    const dirLight3 = new THREE.DirectionalLight(0x445566, 0.4);
    dirLight3.position.set(0, 0, -50);
    scene.add(dirLight3);

    // Grid + Axes
    const gridHelper = new THREE.GridHelper(100, 20, 0x444466, 0x333355);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);
    scene.add(new THREE.AxesHelper(30));

    // PBR material for stock - metallic surface reveals tool marks via reflections
    const stockMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      metalness: 0.85,
      roughness: 0.25,
      envMapIntensity: 1.0,
    });
    materialRef.current = stockMaterial;

    // Target shape material (green, semi-transparent)
    const targetMaterial = new THREE.MeshStandardMaterial({
      color: 0x22cc66,
      side: THREE.DoubleSide,
      metalness: 0.3,
      roughness: 0.6,
      transparent: true,
      opacity: 0.6,
    });
    targetMaterialRef.current = targetMaterial;

    // Resize
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
    const material = materialRef.current;
    if (!scene || !material) return;

    if (stockMeshRef.current) {
      scene.remove(stockMeshRef.current);
      stockMeshRef.current.geometry.dispose();
      stockMeshRef.current = null;
    }

    if (stockGeometry && showStock) {
      const mesh = new THREE.Mesh(stockGeometry, material);
      scene.add(mesh);
      stockMeshRef.current = mesh;
    }
  }, [stockGeometry, showStock]);

  // Update target mesh
  useEffect(() => {
    const scene = sceneRef.current;
    const material = targetMaterialRef.current;
    if (!scene || !material) return;

    if (targetMeshRef.current) {
      scene.remove(targetMeshRef.current);
      targetMeshRef.current.geometry.dispose();
      targetMeshRef.current = null;
    }

    if (targetGeometry && showTarget) {
      const mesh = new THREE.Mesh(targetGeometry, material);
      scene.add(mesh);
      targetMeshRef.current = mesh;
    }
  }, [targetGeometry, showTarget]);

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
          tool.type, tool.diameter, tool.cornerRadius, tool.fluteLength);
        toolMesh.position.set(toolPosition.x, toolPosition.y, toolPosition.z);

        // 5-axis: tilt tool to match axis direction
        if (toolAxis) {
          const dir = new THREE.Vector3(toolAxis.ai, toolAxis.aj, toolAxis.ak).normalize();
          const up = new THREE.Vector3(0, 0, 1);
          const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
          toolMesh.quaternion.copy(quat);
        }

        scene.add(toolMesh);
        toolGroupRef.current = toolMesh;
      }
    }
  }, [toolPosition, toolAxis, currentToolId, showTool, tools]);

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
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    />
  );
}
