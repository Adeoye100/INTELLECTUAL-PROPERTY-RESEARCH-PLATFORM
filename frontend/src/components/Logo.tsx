import React from 'react';
import { Shield } from 'lucide-react';
import { cn } from '../lib/utils';

export const Logo: React.FC<{ variant?: 'full' | 'icon'; className?: string }> = ({ variant = 'full', className }) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex items-center justify-center w-8 h-8 rounded bg-forge-silver-100">
        <Shield className="w-6 h-6 text-forge-navy-950 fill-forge-silver-300" />
      </div>
      {variant === 'full' && (
        <div className="flex flex-col leading-none">
          <span className="text-lg font-black tracking-tighter text-white">FORGE GLOBAL</span>
          <span className="text-[10px] font-medium tracking-widest text-forge-subtext-onDark">BRAND PROTECTION</span>
        </div>
      )}
    </div>
  );
};
