import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Search, Calendar, Clock, Play, CheckCircle, AlertCircle, Edit, Trash2, User
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

// ── Animation ───────────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};

const itemVariants = {
  hidden: { y: 12, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 120, damping: 14 } }
};

// ── Status & Priority ───────────────────────────────────────────────────
const getStatusStyle = (status: string, isOverdue: boolean) => {
  if (isOverdue) return { bg: 'bg-red-100', text: 'text-red-800', label: 'Overdue' };
  switch (status) {
    case 'completed': return { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Done' };
    case 'in_progress': return { bg: 'bg-blue-100', text: 'text-blue-800', label: 'In Progress' };
    case 'pending': default: return { bg: 'bg-amber-100', text: 'text-amber-800', label: 'To Do' };
  }
};

const getPriorityDot = (priority: string) => {
  switch (priority) {
    case 'critical': return 'bg-red-500';
    case 'high':     return 'bg-orange-500';
    case 'medium':   return 'bg-amber-500';
    default:         return 'bg-gray-400';
  }
};

export default function Tasks() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    api.get('/tasks')
      .then(res => setTasks(res.data || []))
      .catch(() => toast.error('Failed to load tasks'));
  }, []);

  const isOverdue = (task: any) =>
    task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date();

  const filteredTasks = tasks.filter(task => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      task.title?.toLowerCase().includes(q) ||
      task.description?.toLowerCase().includes(q);

    const currentStatus = isOverdue(task) ? 'overdue' : task.status;
    const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const changeStatus = async (task: any, newStatus: string) => {
    try {
      await api.put(`/tasks/${task.id}`, { ...task, status: newStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/40">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 mb-8">
          <h1 className="text-3xl font-semibold text-gray-900">Tasks</h1>

          <div className="flex items-center gap-4">
            <div className="bg-white border rounded-md shadow-sm flex overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                className={`px-4 py-1.5 text-sm font-medium ${viewMode === 'grid' ? 'bg-gray-100' : 'text-gray-600'}`}
                onClick={() => setViewMode('grid')}
              >
                Grid
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`px-4 py-1.5 text-sm font-medium ${viewMode === 'list' ? 'bg-gray-100' : 'text-gray-600'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </Button>
            </div>

            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
              <Plus size={16} className="mr-1.5" />
              New Task
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-end mb-8">
          <div className="flex-1 min-w-[280px]">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tasks…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 bg-white border-gray-200 focus:border-indigo-400 focus:ring-indigo-200"
              />
            </div>
          </div>

          <div className="w-44">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">To Do</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Done</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tasks Content */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5'
              : 'divide-y divide-gray-200 rounded-lg border bg-white overflow-hidden'
          }
        >
          {filteredTasks.length === 0 ? (
            <div className="col-span-full py-20 text-center text-gray-500">
              <Calendar className="mx-auto h-12 w-12 opacity-40" />
              <p className="mt-4 text-lg font-medium">No tasks found</p>
              <p className="mt-1">Try adjusting your filters</p>
            </div>
          ) : viewMode === 'grid' ? (
            // ── Linear-inspired Grid Cards ────────────────────────────────
            filteredTasks.map(task => {
              const overdue = isOverdue(task);
              const statusStyle = getStatusStyle(task.status, overdue);
              const priorityColor = getPriorityDot(task.priority || 'medium');

              return (
                <motion.div key={task.id} variants={itemVariants}>
                  <div
                    className={`
                      group relative rounded-lg border border-gray-200 bg-white p-4.5
                      transition-all duration-200 hover:border-gray-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
                      ${overdue ? 'border-l-4 border-l-red-500/80 bg-red-50/20' : ''}
                    `}
                  >
                    {/* Priority dot + Title */}
                    <div className="flex items-start gap-2.5 mb-2">
                      <div className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${priorityColor}`} />
                      <h3 className="font-medium text-[15px] leading-tight flex-1 line-clamp-2">
                        {task.title}
                      </h3>

                      {/* Status pill – top right */}
                      <Badge
                        className={`
                          text-xs font-medium px-2.5 py-0.5 rounded-full
                          ${statusStyle.bg} ${statusStyle.text}
                        `}
                      >
                        {statusStyle.label}
                      </Badge>
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 mt-auto pt-2">
                      {/* Assignee */}
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-700">
                          {task.assignee?.name?.[0] || '?'}
                        </div>
                        <span className="truncate max-w-[140px]">{task.assignee?.name || 'Unassigned'}</span>
                      </div>

                      {/* Due */}
                      {task.due_date && (
                        <div className="flex items-center gap-1">
                          <Calendar size={13} className="text-gray-400" />
                          <span className={overdue ? 'text-red-600 font-medium' : ''}>
                            {format(new Date(task.due_date), 'MMM d, yyyy')}
                          </span>
                        </div>
                      )}

                      {/* Category */}
                      {task.category && (
                        <span className="text-xs text-gray-500 font-medium">
                          {task.category.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Hover actions */}
                    <div className="absolute right-4 bottom-4 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="text-gray-400 hover:text-indigo-600 transition-colors">
                        <Edit size={16} />
                      </button>
                      <button className="text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            // ── List View (Linear-inspired minimal table) ──────────────────
            <>
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50/70 text-xs font-medium text-gray-600 border-b">
                <div className="col-span-6">Task</div>
                <div className="col-span-2">Assignee</div>
                <div className="col-span-2">Due</div>
                <div className="col-span-2 text-right pr-4">Status</div>
              </div>

              {filteredTasks.map(task => {
                const overdue = isOverdue(task);
                const statusStyle = getStatusStyle(task.status, overdue);

                return (
                  <motion.div
                    key={task.id}
                    variants={itemVariants}
                    className="grid grid-cols-12 gap-4 px-6 py-3.5 hover:bg-gray-50/60 transition-colors items-center border-b last:border-b-0"
                  >
                    <div className="col-span-6">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-2 w-2 rounded-full ${getPriorityDot(task.priority || 'medium')}`} />
                        <span className="font-medium text-[15px]">{task.title}</span>
                      </div>
                      {task.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>
                      )}
                    </div>

                    <div className="col-span-2 flex items-center gap-2 text-sm">
                      <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                        {task.assignee?.name?.[0] || '?'}
                      </div>
                      <span className="truncate">{task.assignee?.name || '—'}</span>
                    </div>

                    <div className="col-span-2 text-sm">
                      {task.due_date ? (
                        <span className={overdue ? 'text-red-600' : 'text-gray-600'}>
                          {format(new Date(task.due_date), 'MMM d')}
                        </span>
                      ) : '—'}
                    </div>

                    <div className="col-span-2 flex justify-end">
                      <Badge
                        className={`text-xs px-2.5 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {statusStyle.label}
                      </Badge>
                    </div>
                  </motion.div>
                );
              })}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
