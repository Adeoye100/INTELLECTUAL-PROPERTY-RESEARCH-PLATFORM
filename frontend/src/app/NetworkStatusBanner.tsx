import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

type NetworkState = 'online' | 'offline' | 'restored';

export function NetworkStatusBanner() {
  const [networkState, setNetworkState] = useState<NetworkState>(() => navigator.onLine ? 'online' : 'offline');

  useEffect(() => {
    const handleOffline = () => setNetworkState('offline');
    const handleOnline = () => setNetworkState((current) => current === 'offline' ? 'restored' : 'online');
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (networkState === 'online') return null;

  return networkState === 'offline' ? (
    <div className="relative z-[60] flex items-center justify-center gap-2 bg-risk-high px-4 py-2 text-sm font-bold text-white" role="alert">
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      You are offline. Saved screens remain visible, but requests may fail until the connection returns.
    </div>
  ) : (
    <div className="relative z-[60] flex items-center justify-center gap-2 bg-risk-low px-4 py-2 text-sm font-bold text-white" role="status" aria-live="polite">
      <Wifi className="h-4 w-4" aria-hidden="true" />
      Connection restored. Retry any failed request.
    </div>
  );
}
