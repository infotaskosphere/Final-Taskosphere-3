import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, Button, Input, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Search, Calendar, Clock, Play, CheckCircle, AlertCircle, Edit, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

// ── Animation Variants ────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 }
};

// ── Status Styles ─────────────────────────────────────────────────────
const getStatusStyle = (status, isOverdue) => {
  if (isOverdue) {
    return { bg: 'bg-red-100', text: 'text-red-800', label: 'Overdue' };
  }
  const styles = {
    pending:    { bg: 'bg-amber-100', text: 'text-amber-800', label: 'To Do' },
    in_progress: { bg: 'bg-blue-100',  text: 'text-blue-800',  label: 'In Progress' },
    completed:  { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Done' }
  };
  return styles[status] || styles.pending;
};

// ── Main Component ────────────────────────────────────────────────────
export default function Tasks() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    api.get('/tasks')
      .then(res => setTasks(res.data || []))
      .catch(() => toast.error('Failed to load tasks'));
  }, []);

  const isOverdue = (task) =>
    task.status !== 'completed' &&
    task.due_date &&
    new Date(task.due_date) < new Date();

  const filteredTasks = tasks.filter((task) => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      (task.title || '').toLowerCase().includes(q) ||
      (task.description || '').toLowerCase().includes(q);

    const currentStatus = isOverdue(task) ? 'overdue' : task.status || 'pending';
    const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = async (task, newStatus) => {
    try {
      await api.put(`/tasks/${task.id}`, { ...task, status: newStatus });
      setTasks(prev =>
        prev.map(t => (t.id === task.id ? { ...t, status: newStatus } : t))
      );
      toast.success('Status updated');
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>

          <div className="flex items-center gap-4">
            <div className="bg-white border rounded-md shadow-sm flex overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                className={`px-5 py-2 text-sm ${viewMode === 'grid' ? 'bg-gray-100 font-medium' : 'text-gray-600'}`}
                onClick={() => setViewMode('grid')}
              >
                Grid
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`px-5 py-2 text-sm ${viewMode === 'list' ? 'bg-gray-100 font-medium' : 'text-gray-600'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </Button>
            </div>

            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus size={18} className="mr-2" />
              New Task
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-10">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-11 bg-white"
              />
            </div>
          </div>

          <div className="w-48">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="All statuses" />
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

        {/* Content */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
              : 'border rounded-lg bg-white overflow-hidden divide-y divide-gray-200'
          }
        >
          {filteredTasks.length === 0 ? (
            <div className="col-span-full py-20 text-center text-gray-500">
              <Calendar className="mx-auto h-12 w-12 opacity-50 mb-4" />
              <p className="text-lg font-medium">No tasks found</p>
            </div>
          ) : viewMode === 'grid' ? (
            // ── Grid Cards ────────────────────────────────────────────────
            filteredTasks.map((task) => {
              const overdue = isOverdue(task);
              const style = getStatusStyle(task.status, overdue);

              return (
                <motion.div key={task.id} variants={itemVariants}>
                  <div
                    className={`rounded-lg border bg-white p-5 shadow-sm hover:shadow transition-shadow ${
                      overdue ? 'border-red-200 bg-red-50/40' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-lg line-clamp-2 flex-1 pr-2">
                        {task.title}
                      </h3>

                      <Badge
                        className={`text-xs px-3 py-1 rounded-full ${style.bg} ${style.text}`}
                      >
                        {style.label}
                      </Badge>
                    </div>

                    {task.description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mt-auto">
                      {task.due_date && (
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} className="text-gray-500" />
                          <span className={overdue ? 'text-red-600 font-medium' : ''}>
                            {format(new Date(task.due_date), 'MMM d, yyyy')}
                          </span>
                        </div>
                      )}

                      <span className="text-xs font-medium text-gray-500">
                        {task.category ? task.category.toUpperCase() : 'OTHER'}
                      </span>
                    </div>

                    {/* Quick actions – bottom right */}
                    <div className="flex justify-end gap-3 mt-4">
                      <button
                        onClick={() => handleStatusChange(task, 'pending')}
                        title="To Do"
                      >
                        <Clock size={18} className={task.status === 'pending' ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'} />
                      </button>
                      <button
                        onClick={() => handleStatusChange(task, 'in_progress')}
                        title="In Progress"
                      >
                        <Play size={18} className={task.status === 'in_progress' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'} />
                      </button>
                      <button
                        onClick={() => handleStatusChange(task, 'completed')}
                        title="Done"
                      >
                        <CheckCircle size={18} className={task.status === 'completed' ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            // ── List View ──────────────────────────────────────────────────
            <>
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 text-xs font-medium text-gray-600">
                <div className="col-span-5">Task</div>
                <div className="col-span-3">Due Date</div>
                <div className="col-span-2 text-center">Status</div>
                <div className="col-span-2 text-right pr-4">Actions</div>
              </div>

              {filteredTasks.map((task) => {
                const overdue = isOverdue(task);
                const style = getStatusStyle(task.status, overdue);

                return (
                  <motion.div
                    key={task.id}
                    variants={itemVariants}
                    className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50 transition-colors items-center border-b last:border-b-0"
                  >
                    <div className="col-span-5">
                      <div className="font-medium">{task.title}</div>
                      {task.description && (
                        <div className="text-sm text-gray-500 mt-1 line-clamp-1">
                          {task.description}
                        </div>
                      )}
                    </div>

                    <div className="col-span-3 text-sm">
                      {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : '—'}
                      {overdue && <AlertCircle size={14} className="ml-2 text-red-500 inline" />}
                    </div>

                    <div className="col-span-2 flex justify-center">
                      <Badge className={`text-xs px-3 py-1 ${style.bg} ${style.text}`}>
                        {style.label}
                      </Badge>
                    </div>

                    <div className="col-span-2 flex justify-end gap-4">
                      <button onClick={() => handleStatusChange(task, 'pending')}>
                        <Clock size={18} className={task.status === 'pending' ? 'text-amber-600' : 'text-gray-400'} />
                      </button>
                      <button onClick={() => handleStatusChange(task, 'in_progress')}>
                        <Play size={18} className={task.status === 'in_progress' ? 'text-blue-600' : 'text-gray-400'} />
                      </button>
                      <button onClick={() => handleStatusChange(task, 'completed')}>
                        <CheckCircle size={18} className={task.status === 'completed' ? 'text-emerald-600' : 'text-gray-400'} />
                      </button>
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
