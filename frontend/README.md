# React + TypeScript + Vite

## Deployment

### Vercel

The frontend is configured for deployment from the repository root using
`../vercel.ts`. Leave Vercel's **Root Directory** unset so its build commands
can use the locked `frontend/` project and dynamic CSP configuration.

Required environment variables in Vercel:
- `VITE_API_BASE_URL`: The absolute URL of the API (e.g., `https://api.example.com/api/v1`).
- `VITE_API_MODE`: Set to `live` (default) or omit it.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`: browser-safe Supabase
  project values only.

When importing the project to Vercel:
1. Keep the **Root Directory** at the repository root.
2. Vercel uses the explicit Vite configuration in `vercel.ts`.
3. Configure the browser-safe environment variables mentioned above separately
   for Preview and Production.

## API configuration

Copy the relevant values from `.env` into deployment-managed environment configuration. Live mode requires `VITE_API_BASE_URL` and the value must end in `/api/v1`. `VITE_API_MODE` defaults to `live`; MSW starts only when `VITE_API_MODE=mock` is explicitly set while running a Vite development build. Staging and production builds reject mock mode.

The frontend only claims the documented backend contracts; approved environment
configuration is required before a live request is attempted. See
`../Documentations/07-frontend-api-contracts.md` for route details and staging
gates.

## Visualization Track

Dashboard analytics is read from the firm-scoped backend aggregate endpoint,
not recomputed from raw rows. Recharts 3.10.1 powers the dashboard and
confusion-risk component chart. Shared visualization primitives enforce
accessible text equivalents, reduced motion, risk-token exclusivity, neutral
source/renewal states, and loading/empty/error/partial states. Real staging
P95 and visual QA evidence remain pending.

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
