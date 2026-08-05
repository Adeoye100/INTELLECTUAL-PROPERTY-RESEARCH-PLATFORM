import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

vi.stubEnv('VITE_API_BASE_URL', '/api/v1');
vi.stubEnv('VITE_API_MODE', 'live');

afterEach(() => {
  cleanup();
});
