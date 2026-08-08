import React from 'react';
import { Outlet } from 'react-router-dom';
import { Logo } from '../components/Logo';

export const AuthLayout: React.FC = () => {
  return (
    <main id="main-content" className="min-h-screen w-full flex items-center justify-center bg-forge-gradient p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo className="scale-125" />
        </div>
        <div className="bg-surface-card rounded-lg shadow-2xl p-8 border border-forge-silver-300">
          <Outlet />
        </div>
        <footer className="mt-8 w-full bg-forge-navy-950/90 py-4 backdrop-blur-sm rounded-lg text-center text-forge-subtext-onDark text-sm">
          © 2026 Forge Global Intellectual Property Security. All rights reserved.
        </footer>
      </div>
    </main>
  );
};
