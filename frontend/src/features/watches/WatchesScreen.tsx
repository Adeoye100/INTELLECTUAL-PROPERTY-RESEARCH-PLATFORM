import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Bell, Shield, ArrowRight, Settings } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Link } from 'react-router-dom';
import type { Alert } from '../../types';

interface Watch {
  id: string;
  alertChannel: string;
  alertMode: string;
  markText: string;
}

export const WatchesScreen: React.FC = () => {
  const { data: alerts, isLoading: alertsLoading } = useQuery<(Alert & { matchedMarkText: string })[]>({
    queryKey: ['alerts'],
    queryFn: async () => {
      const response = await fetch('/api/alerts');
      return response.json();
    },
  });

  const { data: watches, isLoading: watchesLoading } = useQuery<Watch[]>({
    queryKey: ['watches'],
    queryFn: async () => {
      const response = await fetch('/api/watches');
      return response.json();
    },
  });

  if (alertsLoading || watchesLoading) return <div className="p-8 text-center">Loading monitoring data...</div>;

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between md:max-xl:flex-col md:max-xl:items-stretch md:max-xl:gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Watches & Alerts</h1>
          <p className="text-text-secondary text-sm">Real-time monitoring of global registry filings</p>
        </div>
        <div className="flex gap-2 md:max-xl:flex-wrap">
            <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Notification Settings
            </Button>
            <Button size="sm">
                <Eye className="w-4 h-4 mr-2" />
                Create New Watch
            </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Active Alerts Feed */}
        <div className="xl:col-span-2 space-y-4">
          <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Recent Alerts
          </h2>
          
          {alerts?.map((alert) => (
            <Card key={alert.id} className={cn("border-l-4", alert.riskScore?.compositeRating === 'high' ? "border-l-risk-high" : "border-l-risk-medium")}>
              <div className="flex items-start justify-between gap-4 md:max-xl:flex-col">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge risk={alert.riskScore?.compositeRating}>{alert.riskScore?.compositeRating} Risk</Badge>
                    <span className="text-xs text-text-secondary font-medium">
                        {new Date(alert.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-text-primary">
                    Potential conflict detected: <span className="font-mono uppercase">{alert.matchedMarkText}</span>
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Matched against your watch for <span className="font-bold">FORGE GLOBAL</span>.
                    Registry: {alert.matchedFilingRef.startsWith('US') ? 'USPTO' : 'Other'}.
                  </p>
                </div>
                <Link to={`/search/risk/${alert.id}`} className="md:max-xl:self-end">
                  <Button size="sm" variant="outline">
                    Analyze <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
          
          {(!alerts || alerts.length === 0) && (
            <div className="py-12 text-center bg-surface-card rounded-lg border border-forge-silver-300">
               <Bell className="w-12 h-12 text-forge-silver-300 mx-auto mb-4" />
               <p className="text-text-secondary">No new alerts. Your portfolio is secure.</p>
            </div>
          )}
        </div>

        {/* Active Watches Sidebar */}
        <div className="xl:col-span-1 space-y-4">
          <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Active Watches
          </h2>
          
          {watches?.map((watch) => (
            <Card key={watch.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-forge-teal-700" />
                  <span className="font-bold uppercase font-mono text-sm">{watch.markText}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-risk-low" aria-hidden="true"></div>
                  <span className="text-[10px] font-bold uppercase text-text-secondary">Active</span>
                </div>
              </div>
              <div className="text-[10px] text-text-secondary uppercase font-bold space-y-1">
                <div className="flex justify-between">
                  <span>Channel</span>
                  <span className="text-text-primary">{watch.alertChannel}</span>
                </div>
                <div className="flex justify-between">
                  <span>Frequency</span>
                  <span className="text-text-primary">{watch.alertMode}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full mt-3 h-8 text-xs">
                Manage Watch
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}
