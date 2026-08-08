# React + TypeScript + Vite

## Deployment

### Vercel

The frontend is configured for deployment on Vercel using `frontend/vercel.json`.

Required environment variables in Vercel:
- `VITE_API_BASE_URL`: The absolute URL of the API (e.g., `https://api.example.com/api/v1`).
- `VITE_API_MODE`: Set to `live` (default) or omit it.

When importing the project to Vercel:
1. Set the **Root Directory** to `frontend`.
2. Vercel should automatically detect **Vite** as the Framework Preset.
3. Configure the environment variables mentioned above.

## API configuration

Copy the relevant values from `.env` into deployment-managed environment configuration. Live mode requires `VITE_API_BASE_URL` and the value must end in `/api/v1`. `VITE_API_MODE` defaults to `live`; MSW starts only when `VITE_API_MODE=mock` is explicitly set while running a Vite development build. Staging and production builds reject mock mode.

The current repository has no backend application implementation, so no live endpoint is claimed as integrated. See `../Documentations/07-frontend-api-contracts.md` for the mock-only candidate contracts and blockers.

## Quality gate

Run `pnpm lint`, `pnpm test`, and `pnpm build` from this directory. CI runs the same sequence with a locked install; run `git diff --check` from the repository root. The evidence-based frontend audit, including keyboard, accessibility, responsive, state, bundle, CI, and remaining manual checks, is in `../Documentations/08-frontend-quality-gate.md`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
