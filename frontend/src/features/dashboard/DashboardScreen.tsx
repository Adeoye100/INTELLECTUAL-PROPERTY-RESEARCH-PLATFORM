import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  AlertCircle, 
  TrendingUp, 
  Search, 
  ArrowRight,
  Clock
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Link } from 'react-router-dom';
import type { Alert } from '../../types';
import { useAuthStore } from '../auth/authStore';
import { useOnboardingStore } from '../onboarding/onboardingStore';
import { OnboardingChecklist } from '../onboarding/OnboardingChecklist';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export const DashboardScreen: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const clientProgress = useOnboardingStore((state) => user ? state.progressByUser[user.id] : undefined);
  const showOnboarding = user?.onboardingRequired === true && !clientProgress?.completedPath;
  const { data: alerts } = useQuery<(Alert & { matchedMarkText: string })[]>({
    queryKey: ['alerts'],
    queryFn: async () => {
      const response = await fetch('/api/alerts');
      return response.json();
    },
    enabled: !showOnboarding,
  });

  const chartData = [
    { name: 'Mon', count: 4 },
    { name: 'Tue', count: 7 },
    { name: 'Wed', count: 5 },
    { name: 'Thu', count: 12 },
    { name: 'Fri', count: 9 },
    { name: 'Sat', count: 2 },
    { name: 'Sun', count: 3 },
  ];

  const riskData = [
    { name: 'High Risk', value: 4, color: '#B3261E' },
    { name: 'Medium Risk', value: 8, color: '#B8860B' },
    { name: 'Low Risk', value: 12, color: '#1E8A5B' },
  ];

  if (showOnboarding) {
    return <OnboardingChecklist />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Console Overview</h1>
        <p className="text-text-secondary text-sm">Welcome back, {user?.fullName ?? 'researcher'}. Here is your brand security posture.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-forge-navy-950 text-white border-none">
          <div className="text-[10px] text-forge-subtext-onDark uppercase font-bold mb-1">Portfolio Health</div>
          <div className="text-3xl font-black">94%</div>
          <div className="text-xs text-risk-low mt-2 flex items-center gap-1 font-bold">
            <TrendingUp className="w-3 h-3" /> +2% from last month
          </div>
        </Card>
        <Card>
          <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Pending Alerts</div>
          <div className="text-3xl font-black text-risk-high flex items-center gap-2">
            <AlertCircle className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
            {alerts?.length || 0}
          </div>
          <div className="text-xs text-text-secondary mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> 2 requiring urgent review
          </div>
        </Card>
        <Card>
          <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Active Watches</div>
          <div className="text-3xl font-black text-forge-teal-700">12</div>
          <div className="text-xs text-text-secondary mt-2">Monitoring 18 assets</div>
        </Card>
        <Card>
          <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Next Renewal</div>
          <div className="text-3xl font-black text-text-primary font-mono">OCT 14</div>
          <div className="text-xs text-risk-medium mt-2 font-bold flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> FORGE GLOBAL (US)
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <Card title="Infringement Detection Activity" className="lg:col-span-2">
          <div className="h-80 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#146575" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#146575" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7EAEE" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#5B6470'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#5B6470'}} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#146575" fillOpacity={1} fill="url(#colorCount)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Risk Distribution */}
        <Card title="Portfolio Risk Profile">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {riskData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {riskData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-text-secondary">{item.name}</span>
                </div>
                <span className="font-bold text-text-primary">{item.value} Marks</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent Alerts" footer={<Link to="/watches" className="text-forge-teal-700 font-bold flex items-center gap-1 text-sm hover:underline">View all alerts <ArrowRight className="w-4 h-4" /></Link>}>
           <div className="space-y-4">
              {alerts?.slice(0, 3).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between py-2 border-b border-forge-silver-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge risk={alert.riskScore?.compositeRating} className="w-16 justify-center">{alert.riskScore?.compositeRating}</Badge>
                    <div>
                      <div className="text-sm font-bold text-text-primary uppercase font-mono">{alert.matchedMarkText}</div>
                      <div className="text-[10px] text-text-secondary uppercase font-bold">Conflict with FORGE GLOBAL</div>
                    </div>
                  </div>
                  <Link to={`/search/risk/${alert.id}`}>
                    <Button variant="ghost" size="sm">Review</Button>
                  </Link>
                </div>
              ))}
           </div>
        </Card>

        <Card title="Recommended Actions">
           <div className="space-y-4">
              <div className="p-4 rounded bg-risk-high/5 border border-risk-high/20 flex items-start gap-4">
                 <AlertCircle className="w-5 h-5 text-risk-high mt-1" />
                 <div>
                    <h4 className="font-bold text-text-primary">Renewal Deadline Approaching</h4>
                    <p className="text-sm text-text-secondary">Trademark "FORGE GLOBAL" (US) requires renewal by Oct 14, 2026. Failure to file will result in abandonment.</p>
                    <Button className="mt-2" size="sm">File Renewal</Button>
                 </div>
              </div>
              <div className="p-4 rounded bg-forge-teal-700/5 border border-forge-teal-700/20 flex items-start gap-4">
                 <Search className="w-5 h-5 text-forge-teal-700 mt-1" />
                 <div>
                    <h4 className="font-bold text-text-primary">Perform Monthly Sweep</h4>
                    <p className="text-sm text-text-secondary">Run your scheduled portfolio-wide search to detect new similar filings.</p>
                    <Button variant="outline" className="mt-2" size="sm">Run Sweep</Button>
                 </div>
              </div>
           </div>
        </Card>
      </div>
    </div>
  );
};
