import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

vi.stubEnv('VITE_API_BASE_URL', '/api/v1');
vi.stubEnv('VITE_API_MODE', 'live');
vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');

afterEach(() => {
  cleanup();
});
