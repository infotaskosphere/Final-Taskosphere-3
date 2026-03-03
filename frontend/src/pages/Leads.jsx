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
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Lead Card
// ─────────────────────────────────────────────────────────────

function LeadCard({ lead, users, isAdmin, onAssign }) {
  const assignee = users.find(u => u.id === lead.assigned_to);
  const isTelegram = lead.source === 'telegram';

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="relative flex flex-col p-6 rounded-3xl border bg-white shadow-sm hover:shadow-xl transition-all border-slate-100"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="text-[10px] uppercase font-bold bg-slate-100">
              {lead.source || 'manual'}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase font-bold">
              {lead.status || 'new'}
            </Badge>
          </div>

          {/* ✅ company_name instead of client_name */}
          <h3 className="text-lg font-bold text-slate-900 truncate">
            {lead.company_name}
          </h3>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50">
          {isTelegram ? (
            <Send className="w-5 h-5 text-sky-500" />
          ) : (
            <UserPlus className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm">
        {/* ✅ phone instead of contact_number */}
        <div className="flex items-center gap-2 text-slate-600">
          <Phone className="w-4 h-4" />
          <span>{lead.phone || '—'}</span>
        </div>

        <div className="flex items-center gap-2 text-slate-600">
          <User className="w-4 h-4" />
          <span>{assignee?.full_name || 'Not Assigned'}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between pt-4 border-t">
        <p className="text-xs text-slate-400">
          {lead.created_at
            ? format(new Date(lead.created_at), 'MMM d • h:mm a')
            : ''}
        </p>

        {isAdmin && (
          <Select onValueChange={(val) => onAssign(lead.id, val)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Assign" />
            </SelectTrigger>
            <SelectContent>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  const isAdmin = user?.role === 'admin';
  const hasLeadPermission = user?.permissions?.can_view_all_leads;

  // ── Fetch Leads ──
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get('/leads').then(res => res.data),
  });

  // ── Fetch Users ──
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => res.data),
  });

  // ✅ Updated assignment mutation (PATCH /leads/{id})
  const assignMutation = useMutation({
    mutationFn: ({ id, staffId }) =>
      api.patch(`/leads/${id}`, { assigned_to: staffId }),

    onSuccess: () => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Lead assigned successfully');
    },

    onError: () => {
      toast.error('Failed to assign lead');
    }
  });

  // ✅ Updated filtering fields
  const filteredLeads = useMemo(() => {
    return leads.filter(l =>
      l.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone?.includes(searchTerm)
    );
  }, [leads, searchTerm]);

  // Permission guard
  if (!isAdmin && !hasLeadPermission) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Card className="p-10 text-center">
          <h2 className="text-2xl font-bold">Restricted Area</h2>
          <p className="text-slate-500 mt-2">
            You don’t have permission to view leads.
          </p>
          <Button onClick={() => navigate('/')} className="mt-6">
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">

      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Leads Pipeline</h1>

        <div className="relative w-72">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search leads..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Total</p>
            <h3 className="text-2xl font-bold">{leads.length}</h3>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Telegram</p>
            <h3 className="text-2xl font-bold">
              {leads.filter(l => l.source === 'telegram').length}
            </h3>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Unassigned</p>
            <h3 className="text-2xl font-bold">
              {leads.filter(l => !l.assigned_to).length}
            </h3>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Won</p>
            <h3 className="text-2xl font-bold">
              {leads.filter(l => l.status === 'won').length}
            </h3>
          </CardContent>
        </Card>
      </div>

      {/* Leads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence>
          {filteredLeads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              users={users}
              isAdmin={isAdmin}
              onAssign={(id, staffId) =>
                assignMutation.mutate({ id, staffId })
              }
            />
          ))}
        </AnimatePresence>

        {filteredLeads.length === 0 && !isLoading && (
          <div className="col-span-full text-center py-20 text-slate-400">
            No leads found.
          </div>
        )}
      </div>
    </div>
  );
}
