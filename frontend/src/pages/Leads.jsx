import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  UserPlus,
  Phone,
  User,
  Search,
  Filter,
  Send,
  Target,
  Zap,
  ChevronRight,
  TrendingUp
} from 'lucide-react';

// ── Design Constants ────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
};

const springPhysics = {
  card: { type: "spring", stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: "spring", stiffness: 320, damping: 24, mass: 0.9 },
  button: { type: "spring", stiffness: 400, damping: 28 },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } }
};

// ── Lead Card Component ──────────────────────────────────────────────────────
function LeadCard({ lead, users, isAdmin, onAssign }) {
  const assignee = users.find(u => u.id === lead.assigned_to);
  const isTelegram = lead.source === 'telegram';
  
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -5, scale: 1.005, transition: springPhysics.lift }}
      className="relative flex flex-col p-6 rounded-[2.5rem] border bg-white shadow-sm hover:shadow-xl transition-all group border-slate-100"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
             <Badge className={`${isTelegram ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-slate-100 text-slate-700 border-slate-200'} border text-[10px] uppercase tracking-wider font-bold rounded-lg px-2`}>
               {lead.source || 'Manual'}
             </Badge>
             <Badge variant="outline" className="text-[10px] uppercase font-bold rounded-lg px-2 text-emerald-600 border-emerald-200 bg-emerald-50">
               {lead.status || 'New'}
             </Badge>
          </div>
          <h3 className="text-xl font-bold text-slate-900 truncate tracking-tight group-hover:text-blue-600 transition-colors">
            {lead.client_name}
          </h3>
        </div>
        <div className={`p-3 rounded-2xl transition-colors ${isTelegram ? 'bg-sky-50' : 'bg-slate-50'}`}>
          {isTelegram ? <Send className="w-5 h-5 text-sky-500" /> : <UserPlus className="w-5 h-5 text-slate-400" />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
        <div className="flex items-center gap-3 text-slate-600">
          <div className="p-2 bg-slate-50 rounded-xl"><Phone className="w-4 h-4 text-slate-400" /></div>
          <span className="font-semibold tracking-tight">{lead.contact_number}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-600">
          <div className="p-2 bg-slate-50 rounded-xl"><User className="w-4 h-4 text-slate-400" /></div>
          <span className="truncate italic">{assignee?.full_name || 'Not Assigned'}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-50">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          {format(new Date(lead.created_at), 'MMM d • h:mm a')}
        </p>
        
        {isAdmin && (
          <div className="flex gap-2">
             <Select onValueChange={(val) => onAssign(lead.id, val)}>
                <SelectTrigger className="h-9 w-32 text-xs rounded-2xl border-slate-200 bg-slate-50 hover:bg-white transition-colors">
                  <SelectValue placeholder="Assign To" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-100">
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
             </Select>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Page Component ──────────────────────────────────────────────────────
export default function LeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  const isAdmin = user?.role === 'admin';
  const hasLeadPermission = user?.permissions?.can_view_all_leads;

  // Queries
  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get('/leads').then(res => res.data)
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => res.data)
  });

  // Assignment Mutation
  const assignMutation = useMutation({
    mutationFn: ({ id, staffId }) => api.patch(`/leads/${id}/assign`, { assigned_to: staffId }),
    onSuccess: () => {
        queryClient.invalidateQueries(['leads']);
        toast.success('Lead updated successfully');
    }
  });

  const filteredLeads = useMemo(() => {
    return leads.filter(l => 
        l.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.contact_number.includes(searchTerm)
    );
  }, [leads, searchTerm]);

  // Permission Guard
  if (!isAdmin && !hasLeadPermission) {
    return (
      <div className="h-[80vh] flex items-center justify-center p-8">
        <Card className="rounded-[3rem] p-12 shadow-2xl border-0 text-center max-w-md">
          <div className="bg-red-50 p-6 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
            <Zap className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Restricted Area</h2>
          <p className="text-slate-500 mt-3 font-medium">You don't have the required permissions to view the Leads Pipeline.</p>
          <Button onClick={() => navigate('/')} className="mt-8 rounded-2xl px-10 h-12 bg-slate-900">Return to Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      className="p-6 md:p-10 space-y-10"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter flex items-center gap-4">
             <div className="p-3 bg-blue-600 rounded-[1.2rem] shadow-xl shadow-blue-200">
                <Target className="w-8 h-8 text-white" />
             </div>
             Leads Pipeline
          </h1>
          <p className="text-slate-500 font-semibold mt-2 ml-1">Unified sales desk for bot and manual inquiries</p>
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto">
           <div className="relative flex-1 lg:w-96 group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <Input 
                placeholder="Search by name or contact..." 
                className="h-14 pl-14 pr-6 rounded-3xl border-slate-100 bg-white shadow-sm focus:ring-4 focus:ring-blue-50 transition-all text-lg font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
            { label: 'Pipeline Total', val: leads.length, color: COLORS.deepBlue, icon: Zap },
            { label: 'Telegram Leads', val: leads.filter(l => l.source === 'telegram').length, color: '#0088cc', icon: Send },
            { label: 'Manual Entries', val: leads.filter(l => l.source !== 'telegram').length, color: COLORS.mediumBlue, icon: UserPlus },
            { label: 'Unassigned', val: leads.filter(l => !l.assigned_to).length, color: COLORS.coral, icon: Filter },
        ].map((s, i) => (
            <motion.div key={i} variants={itemVariants} whileHover={{ y: -5 }}>
                <Card className="rounded-[2.5rem] border-0 shadow-sm bg-white group overflow-hidden">
                    <CardContent className="p-7">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">{s.label}</p>
                                <h4 className="text-4xl font-black mt-2 tracking-tighter" style={{ color: s.color }}>{s.val}</h4>
                            </div>
                            <div className="p-4 rounded-3xl" style={{ backgroundColor: `${s.color}15` }}>
                                <s.icon className="w-6 h-6" style={{ color: s.color }} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        ))}
      </div>

      {/* Leads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
        <AnimatePresence mode="popLayout">
          {filteredLeads.map(lead => (
            <LeadCard 
                key={lead.id} 
                lead={lead} 
                users={users} 
                isAdmin={isAdmin}
                onAssign={(id, staffId) => assignMutation.mutate({ id, staffId })}
            />
          ))}
        </AnimatePresence>

        {filteredLeads.length === 0 && (
            <div className="col-span-full py-32 text-center">
                <div className="bg-slate-50 w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center">
                    <Search className="w-10 h-10 text-slate-200" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">No matching leads</h3>
                <p className="text-slate-500 font-medium">Try a different search term or check back later.</p>
            </div>
        )}
      </div>
    </motion.div>
  );
}
