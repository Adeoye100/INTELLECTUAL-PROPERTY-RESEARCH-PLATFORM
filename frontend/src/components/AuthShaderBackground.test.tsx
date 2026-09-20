import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canCreateWebGLContext } from '../lib/webgl';
import { AuthShaderBackground } from './AuthShaderBackground';

vi.mock('@shadergradient/react', () => ({
  ShaderGradient: () => <div data-testid="shader-gradient" />,
  ShaderGradientCanvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shader-canvas">{children}</div>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AuthShaderBackground WebGL fallback', () => {
  it('rejects browsers that expose WebGL types but cannot create a context', () => {
    vi.stubGlobal('WebGLRenderingContext', class WebGLRenderingContext {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(canCreateWebGLContext()).toBe(false);
    const { queryByTestId } = render(<AuthShaderBackground />);
    expect(queryByTestId('shader-canvas')).toBeNull();
  });

  it('releases a successfully probed context before loading the decorative shader', async () => {
    vi.stubGlobal('WebGLRenderingContext', class WebGLRenderingContext {});
    const loseContext = vi.fn();
    const context = { getExtension: vi.fn(() => ({ loseContext })) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as WebGLRenderingContext);

    expect(canCreateWebGLContext()).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });
});
