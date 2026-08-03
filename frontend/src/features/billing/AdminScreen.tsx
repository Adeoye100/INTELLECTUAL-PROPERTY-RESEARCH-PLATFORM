import React from 'react';
import { 
  Activity, 
  ShieldCheck,
  UserPlus
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Table, TableRow, TableCell } from '../../components/Table';
import { Badge } from '../../components/Badge';

export const AdminScreen: React.FC = () => {
  const users = [
    { id: 1, name: 'John Doe', email: 'john@firm.com', role: 'Senior Attorney', status: 'Active' },
    { id: 2, name: 'Jane Smith', email: 'jane@firm.com', role: 'Admin', status: 'Active' },
    { id: 3, name: 'Robert Ross', email: 'robert@firm.com', role: 'Viewer', status: 'Inactive' },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Administration</h1>
          <p className="text-text-secondary text-sm">Firm-wide settings, billing, and user management</p>
        </div>
        <Button>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite User
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* User Management */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="User Management">
            <Table headers={['Name', 'Role', 'Status', 'Actions']}>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <div className="font-bold text-text-primary">{user.name}</div>
                      <div className="text-xs text-text-secondary">{user.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>
                    <Badge risk={user.status === 'Active' ? 'low' : 'none'}>{user.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          </Card>

          <Card title="Audit Log">
             <div className="space-y-4">
                {[
                  { action: 'Export generated', user: 'John Doe', time: '2 hours ago' },
                  { action: 'Watch created: FORGE LABS', user: 'Jane Smith', time: '5 hours ago' },
                  { action: 'User login', user: 'Robert Ross', time: '1 day ago' },
                ].map((log, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-forge-silver-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-forge-silver-500" />
                      <div>
                        <span className="font-bold text-text-primary">{log.action}</span>
                        <span className="text-text-secondary ml-2">by {log.user}</span>
                      </div>
                    </div>
                    <span className="text-xs text-text-secondary">{log.time}</span>
                  </div>
                ))}
             </div>
          </Card>
        </div>

        {/* Billing & Subscription */}
        <div className="lg:col-span-1 space-y-6">
          <Card title="Subscription" className="bg-forge-navy-950 text-white border-none">
            <div className="space-y-4">
              <div>
                <div className="text-[10px] text-forge-subtext-onDark uppercase font-bold mb-1">Current Plan</div>
                <div className="text-2xl font-black flex items-center gap-2">
                  ENTERPRISE <ShieldCheck className="w-6 h-6 text-forge-teal-600" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-forge-subtext-onDark uppercase font-bold">Seats</div>
                  <div className="text-lg font-bold">8 / 10</div>
                </div>
                <div>
                  <div className="text-[10px] text-forge-subtext-onDark uppercase font-bold">Next Bill</div>
                  <div className="text-lg font-bold">$1,200</div>
                </div>
              </div>
              <Button className="w-full bg-accent hover:bg-accent-hover">Manage Billing</Button>
            </div>
          </Card>

          <Card title="Usage Summary">
             <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold uppercase">
                    <span>Search Credits</span>
                    <span>842 / 1000</span>
                  </div>
                  <div className="w-full h-2 bg-forge-silver-100 rounded-full overflow-hidden">
                    <div className="h-full bg-forge-teal-700 w-[84%]"></div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold uppercase">
                    <span>Watch Slots</span>
                    <span>18 / 25</span>
                  </div>
                  <div className="w-full h-2 bg-forge-silver-100 rounded-full overflow-hidden">
                    <div className="h-full bg-forge-teal-700 w-[72%]"></div>
                  </div>
                </div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
