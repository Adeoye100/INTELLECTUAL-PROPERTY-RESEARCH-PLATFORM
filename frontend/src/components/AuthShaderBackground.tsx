import { lazy, Suspense } from 'react';

const ShaderGradientScene = lazy(async () => {
  const { ShaderGradient, ShaderGradientCanvas } = await import('@shadergradient/react');

  return {
    default: function ShaderGradientScene() {
      return (
        <ShaderGradientCanvas
          className="h-full w-full"
          style={{ position: 'absolute', inset: 0 }}
          fov={45}
          pixelDensity={1}
          pointerEvents="none"
          lazyLoad={false}
          powerPreference="low-power"
        >
          <ShaderGradient
            animate="on"
            brightness={1}
            cAzimuthAngle={180}
            cDistance={4.6}
            cPolarAngle={115}
            cameraZoom={1}
            color1="#75AEB7"
            color2="#5B6470"
            color3="#146575"
            envPreset="lobby"
            grain="on"
            lightType="3d"
            positionX={-0.5}
            positionY={0.1}
            positionZ={0}
            range="enabled"
            rangeEnd={40}
            rangeStart={0}
            reflection={0.1}
            rotationX={0}
            rotationY={0}
            rotationZ={235}
            shader="defaults"
            type="waterPlane"
            uAmplitude={0}
            uDensity={1.1}
            uFrequency={5.5}
            uSpeed={0.1}
            uStrength={2.8}
            uTime={0.2}
            wireframe={false}
          />
        </ShaderGradientCanvas>
      );
    },
  };
});

/** A decorative sign-in backdrop with a CSS fallback for reduced-motion and non-WebGL devices. */
export function AuthShaderBackground() {
  const reducedMotion = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const supportsWebGL = typeof WebGLRenderingContext !== 'undefined' || typeof WebGL2RenderingContext !== 'undefined';
  const canRenderShader = !reducedMotion && supportsWebGL;

  return (
    <div className="auth-shader-background" aria-hidden="true">
      {canRenderShader && <Suspense fallback={null}><ShaderGradientScene /></Suspense>}
      <div className="auth-shader-background__veil" />
    </div>
  );
}
