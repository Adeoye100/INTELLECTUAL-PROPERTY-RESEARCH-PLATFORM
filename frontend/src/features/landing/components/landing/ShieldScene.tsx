import React, { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import {
  buildWedgeRuntimes,
  createEnvironmentTexture,
  easeOutCubic } from
'./shieldMeshes';

interface ShieldSceneProps {
  progressRef: React.MutableRefObject<number[]>;
  onHover: (index: number | null) => void;
  onSelect: (index: number | null) => void;
}

// Raw Three.js scene (no React Three Fiber) — six brushed-metal facets that
// assemble as scroll progress advances, with a slow group rotation and a
// subtle camera drift. Mounted only for the "full" experience tier and
// loaded as its own lazy chunk.
export function ShieldScene({ progressRef, onHover, onSelect }: ShieldSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlersRef = useRef({ onHover, onSelect });

  useEffect(() => {
    handlersRef.current = { onHover, onSelect };
  }, [onHover, onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // No WebGL — the page still reads fine without the scene.
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(
      32,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      100
    );
    camera.position.set(0, 0.1, 7.5);

    const pmrem = new PMREMGenerator(renderer);
    const envSource = createEnvironmentTexture();
    const envTarget = pmrem.fromEquirectangular(envSource);
    scene.environment = envTarget.texture;
    envSource.dispose();
    pmrem.dispose();

    const ambient = new AmbientLight(0xbfd3dc, 0.35);
    const keyLight = new DirectionalLight(0xf2f4f7, 1.4);
    keyLight.position.set(4, 5, 6);
    const rimLight = new DirectionalLight(0x3fa9c0, 0.5);
    rimLight.position.set(-5, -2, 3);
    const fillLight = new PointLight(0xedeff3, 0.6);
    fillLight.position.set(0, 3, 4);
    scene.add(ambient, keyLight, rimLight, fillLight);

    const group = new Group();
    scene.add(group);

    const runtimes = buildWedgeRuntimes();
    const materials: MeshStandardMaterial[] = [];
    const meshes = runtimes.map((runtime) => {
      const material = new MeshStandardMaterial({
        color: new Color('#AEB6C2'),
        metalness: 1,
        roughness: 0.28,
        emissive: new Color('#EDEFF3'),
        emissiveIntensity: 0.08,
        envMapIntensity: 1.15
      });
      materials.push(material);
      const mesh = new Mesh(runtime.geometry, material);
      mesh.position.copy(runtime.scatteredPos);
      mesh.rotation.copy(runtime.scatteredRot);
      mesh.userData.facetIndex = runtime.index;
      group.add(mesh);
      return mesh;
    });

    const prevProgress = runtimes.map(() => 0);
    const flareStart: (number | null)[] = runtimes.map(() => null);

    // ---- Pointer interaction (hover / click reveals the facet description) ----
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let pointerActive = false;
    let hoveredIndex: number | null = null;

    const updatePointer = (event: PointerEvent | MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointerActive = true;
    };

    const onPointerMove = (event: PointerEvent) => updatePointer(event);
    const onPointerLeave = () => {
      pointerActive = false;
      if (hoveredIndex !== null) {
        hoveredIndex = null;
        document.body.style.cursor = 'auto';
        handlersRef.current.onHover(null);
      }
    };
    const onClick = (event: MouseEvent) => {
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      handlersRef.current.onSelect(
        hit ? hit.object.userData.facetIndex as number : null
      );
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('click', onClick);

    // ---- Resize ----
    const handleResize = () => {
      const width = container.clientWidth;
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // ---- Render loop ----
    const clock = new Clock();
    let frameId = 0;
    let raycastAccumulator = 0;

    const renderFrame = () => {
      frameId = requestAnimationFrame(renderFrame);
      if (document.hidden) return;

      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;

      group.rotation.y += delta * 0.08;
      camera.position.x = Math.sin(elapsed * 0.15) * 0.45;
      camera.position.y = 0.1 + Math.cos(elapsed * 0.11) * 0.2;
      camera.lookAt(0, 0.1, 0);

      runtimes.forEach((runtime, i) => {
        const mesh = meshes[i];
        const material = materials[i];
        const raw = Math.min(1, Math.max(0, progressRef.current[i] ?? 0));
        const p = easeOutCubic(raw);

        mesh.position.lerpVectors(runtime.scatteredPos, runtime.assembledPos, p);
        mesh.rotation.x = MathUtils.lerp(runtime.scatteredRot.x, 0, p);
        mesh.rotation.y = MathUtils.lerp(runtime.scatteredRot.y, 0, p);
        mesh.rotation.z = MathUtils.lerp(runtime.scatteredRot.z, 0, p);

        // Brief silver flare the moment a facet locks in.
        if (raw >= 0.999 && prevProgress[i] < 0.999) {
          flareStart[i] = elapsed;
        }
        prevProgress[i] = raw;

        let emissiveIntensity = 0.08;
        const started = flareStart[i];
        if (started !== null) {
          const since = elapsed - started;
          if (since > 0.9) {
            flareStart[i] = null;
          } else {
            emissiveIntensity = 0.08 + Math.max(0, 1 - since / 0.9) * 2.2;
          }
        }
        material.emissiveIntensity = emissiveIntensity;
      });

      // Hover testing a few times a second is plenty and keeps the loop cheap.
      raycastAccumulator += delta;
      if (pointerActive && raycastAccumulator > 0.08) {
        raycastAccumulator = 0;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(meshes, false)[0];
        const nextIndex = hit ? hit.object.userData.facetIndex as number : null;
        if (nextIndex !== hoveredIndex) {
          hoveredIndex = nextIndex;
          document.body.style.cursor = nextIndex === null ? 'auto' : 'pointer';
          handlersRef.current.onHover(nextIndex);
        }
      }

      renderer.render(scene, camera);
    };
    renderFrame();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('click', onClick);
      document.body.style.cursor = 'auto';

      runtimes.forEach((runtime) => runtime.geometry.dispose());
      materials.forEach((material) => material.dispose());
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [progressRef]);

  return <div ref={containerRef} className="w-full h-full" />;
}
