import React from 'react';
import { getApiConfig } from '../lib/api/config';

export const DemoBanner: React.FC = () => {
  const config = getApiConfig();

  if (config.mode !== 'demo') {
    return null;
  }

  return (
    <div 
      className="sticky top-0 z-[9999] flex w-full items-center justify-center bg-forge-silver-500 py-1.5 px-4 text-center text-xs font-bold uppercase tracking-wider text-white shadow-md"
      role="status"
    >
      DEMO BUILD — showing simulated data, not connected to a live backend.
    </div>
  );
};
