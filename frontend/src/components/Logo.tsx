import React from 'react';
import { cn } from '../lib/utils';

export const Logo: React.FC<{ variant?: 'full' | 'icon'; className?: string }> = ({ variant = 'full', className }) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img src="/logo.png" alt="Forge Global logo" className="w-8 h-8 object-contain" />
      {variant === 'full' && (
        <div className="flex flex-col leading-none">
          <span className="text-lg font-black tracking-tighter text-white">FORGE GLOBAL</span>
          <span className="text-[10px] font-medium tracking-widest text-forge-subtext-onDark">BRAND PROTECTION</span>
        </div>
      )}
    </div>
  );
};
