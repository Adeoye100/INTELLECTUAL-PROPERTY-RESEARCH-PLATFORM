import { HourglassLoader } from '../../../../components/HourglassLoader';

export function LandingBootLoader() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-forge-navy-950 px-6 text-center text-forge-text-onDark"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4">
        <HourglassLoader decorative />
        <p role="status" className="text-sm text-forge-subtext-onDark">Preparing Forge Global…</p>
      </div>
    </main>
  );
}
