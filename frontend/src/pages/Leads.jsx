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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  UserPlus,
  Phone,
  Mail,
  User,
  MessageSquare,
  Search,
  Filter,
  MoreVertical,
  Calendar as CalendarIcon,
  ChevronRight,
  TrendingUp,
  Target,
  Send,
  Zap
} from 'lucide-react';

// ── Shared Design Constants ──────────────────────────────────────────────────
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
  tap: { type: "spring", stiffness: 500, damping: 30 }
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
function LeadCard({ lead, users, isAdmin, onAssign, navigate }) {
  const assignee = users.find(u => u.id === lead.assigned_to);
  const sourceColor = lead.source === 'telegram' ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -5, scale: 1.005, transition: springPhysics.lift }}
      className="relative flex flex-col p-6 rounded-[2rem] border bg-white shadow-sm hover:shadow-xl transition-all group border-slate-100"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
             <Badge className={`${sourceColor} border text-[10px] uppercase tracking-wider font-bold rounded-lg px-2`}>
               {lead.source || 'Manual'}
             </Badge>
             <Badge variant="outline" className="text-[10px] uppercase font-bold rounded-lg px-2 text-emerald-600 border-emerald-200 bg-emerald-50">
               {lead.status || 'New'}
             </Badge>
          </div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">
            {lead.client_name}
          </h3>
        </div>
        <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-blue-50 transition-colors">
          {lead.source === 'telegram' ? <Send className="w-5 h-5 text-sky-500" /> : <UserPlus className="w-5 h-5 text-slate-400" />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-slate-600">
          <div className="p-1.5 bg-slate-100 rounded-lg"><Phone className="w-3.5 h-3.5" /></div>
          <span className="font-medium">{lead.contact_number}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <div className="p-1.5 bg-slate-100 rounded-lg"><User className="w-3.5 h-3.5" /></div>
          <span className="truncate">{assignee?.full_name || 'Unassigned'}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-50">
        <p className="text-[11px] text-slate-400 font-medium italic">
          Added {format(new Date(lead.created_at), 'MMM d, h:mm a')}
        </p>
        
        {isAdmin && (
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
             <Select onValueChange={(val) => onAssign(lead.id, val)}>
                <SelectTrigger className="h-8 w-32 text-xs rounded-xl border-slate-200">
                  <SelectValue placeholder="Assign" />
                </SelectTrigger>
                <SelectContent>
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

// ── Main Leads Management ────────────────────────────────────────────────────
export default function LeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  const isAdmin = user?.role === 'admin';
  const hasLeadPermission = user?.permissions?.can_view_all_leads;

  // Data Fetching
  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get('/leads').then(res => res.data)
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => res.data)
  });

  const createLeadMutation = useMutation({
    mutationFn: (newLead) => api.post('/leads', newLead),
    onSuccess: () => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Lead Captured Successfully');
    }
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, staffId }) => api.patch(`/leads/${id}/assign`, { assigned_to: staffId }),
    onSuccess: () => {
        queryClient.invalidateQueries(['leads']);
        toast.success('Lead Re-assigned');
    }
  });

  const filteredLeads = useMemo(() => {
    return leads.filter(l => 
        l.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.contact_number.includes(searchTerm)
    );
  }, [leads, searchTerm]);

  // Auth Guard
  if (!isAdmin && !hasLeadPermission) {
    return (
      <div className="h-screen flex items-center justify-center p-8 text-center">
        <Card className="rounded-[3rem] p-12 shadow-2xl border-0">
          <div className="bg-red-50 p-6 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
            <Zap className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Access Restricted</h2>
          <p className="text-slate-500 mt-2">You don't have permission to access the Lead Dashboard.</p>
          <Button onClick={() => navigate('/')} className="mt-8 rounded-2xl px-8">Back to Home</Button>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
             <Target className="w-10 h-10 text-blue-600" />
             Leads Pipeline
          </h1>
          <p className="text-slate-500 font-medium mt-1">Manage inquiries from Telegram and Manual entries</p>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
           <div className="relative flex-1 lg:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search leads..." 
                className="pl-12 rounded-[1.2rem] border-slate-200 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
           <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-[1.2rem] px-6 py-6 shadow-lg shadow-blue-200 flex gap-2">
             <UserPlus className="w-5 h-5" />
             <span className="hidden sm:inline">Add Lead</span>
           </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
            { label: 'Total Leads', val: leads.length, color: COLORS.deepBlue, icon: Zap },
            { label: 'New Today', val: leads.filter(l => format(new Date(l.created_at), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')).length, color: COLORS.emeraldGreen, icon: TrendingUp },
            { label: 'Telegram', val: leads.filter(l => l.source === 'telegram').length, color: '#0088cc', icon: Send },
            { label: 'Unassigned', val: leads.filter(l => !l.assigned_to).length, color: COLORS.coral, icon: Filter },
        ].map((s, i) => (
            <motion.div key={i} variants={itemVariants}>
                <Card className="rounded-[2rem] border-0 shadow-sm bg-white overflow-hidden group hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
                                <h4 className="text-3xl font-black mt-1" style={{ color: s.color }}>{s.val}</h4>
                            </div>
                            <div className="p-3 rounded-2xl" style={{ backgroundColor: `${s.color}10` }}>
                                <s.icon className="w-5 h-5" style={{ color: s.color }} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        ))}
      </div>

      {/* Leads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredLeads.map(lead => (
            <LeadCard 
                key={lead.id} 
                lead={lead} 
                users={users} 
                isAdmin={isAdmin}
                onAssign={(id, staffId) => assignMutation.mutate({ id, staffId })}
                navigate={navigate}
            />
          ))}
        </AnimatePresence>

        {filteredLeads.length === 0 && (
            <div className="col-span-full py-20 text-center">
                <div className="bg-slate-50 w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Search className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No leads found</h3>
                <p className="text-slate-500">Try adjusting your search or add a new lead.</p>
            </div>
        )}
      </div>
    </motion.div>
  );
}
