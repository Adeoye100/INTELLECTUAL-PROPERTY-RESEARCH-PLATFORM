export function canCreateWebGLContext(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof WebGLRenderingContext === 'undefined' && typeof WebGL2RenderingContext === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const supported = context !== null;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return supported;
  } catch {
    return false;
  }
}
