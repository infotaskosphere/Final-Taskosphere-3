import React, { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import Papa from "papaparse"
import { useAuth } from "@/contexts/AuthContext"
import api from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Phone, Mail, DollarSign, Trash2, Plus, Search, Calendar, Building2,
  MessageSquare, History, TrendingUp, Filter, ArrowUpRight, Edit2, Download, Upload
} from "lucide-react"
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue
} from "@/components/ui/select"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"

const PIPELINE_STAGES = [
  { id: "new", label: "New", color: "bg-blue-100 text-blue-700" },
  { id: "contacted", label: "Contacted", color: "bg-indigo-100 text-indigo-700" },
  { id: "meeting", label: "Meeting", color: "bg-purple-100 text-purple-700" },
  { id: "proposal", label: "Proposal", color: "bg-yellow-100 text-yellow-700" },
  { id: "negotiation", label: "Negotiation", color: "bg-orange-100 text-orange-700" },
  { id: "on_hold", label: "On Hold", color: "bg-gray-100 text-gray-700" },
  { id: "won", label: "Won", color: "bg-green-100 text-green-700" },
  { id: "lost", label: "Lost", color: "bg-red-100 text-red-700" }
]

const LEAD_SOURCES = ["Website", "Referral", "LinkedIn", "Cold Call", "Event", "Social Media", "Other"]

export default function LeadsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState("quotation_amount")
  const [sortOrder, setSortOrder] = useState("desc")
  const [showCreate, setShowCreate] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [csvFile, setCsvFile] = useState(null)
  const [errors, setErrors] = useState({})

  const [newLead, setNewLead] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    services: [],
    quotation_amount: "",
    status: "new",
    source: "",
    date_of_meeting: "",
    next_follow_up: "",
    notes: "",
    assigned_to: null
  })

  /* ---------- QUERIES & MUTATIONS ---------- */
  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ["leads"],
    queryFn: () => api.get("/leads").then(res => res.data)
  })

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then(res => res.data)
  })

  const createLead = useMutation({
    mutationFn: (data) => api.post("/leads", data),
    onSuccess: () => {
      queryClient.invalidateQueries(["leads"])
      setShowCreate(false)
      resetForm()
    }
  })

  const updateLead = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/leads/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["leads"])
      setShowCreate(false)
      setEditingLead(null)
      resetForm()
    }
  })

  const deleteLead = useMutation({
    mutationFn: (id) => api.delete(`/leads/${id}`),
    onSuccess: () => queryClient.invalidateQueries(["leads"])
  })

  const importCsv = useMutation({
    mutationFn: (data) => api.post("/leads/import", data),
    onSuccess: () => {
      queryClient.invalidateQueries(["leads"])
      setCsvFile(null)
    }
  })

  /* ---------- FORM HELPERS ---------- */
  const resetForm = () => {
    setNewLead({
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      services: [],
      quotation_amount: "",
      status: "new",
      source: "",
      date_of_meeting: "",
      next_follow_up: "",
      notes: "",
      assigned_to: null
    })
    setErrors({})
  }

  const validateForm = () => {
    const newErrors = {}
    if (!newLead.company_name.trim()) {
      newErrors.company_name = "Company name is required"
    }
    if (!newLead.contact_name.trim()) {
      newErrors.contact_name = "Contact person is required"
    }
    if (newLead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newLead.email)) {
      newErrors.email = "Invalid email format"
    }
    if (newLead.phone && !/^\+?[1-9]\d{1,14}$/.test(newLead.phone)) {
      newErrors.phone = "Invalid phone number format"
    }
    if (newLead.quotation_amount && (isNaN(newLead.quotation_amount) || Number(newLead.quotation_amount) < 0)) {
      newErrors.quotation_amount = "Quotation amount must be a positive number"
    }
    if (newLead.date_of_meeting && new Date(newLead.date_of_meeting) > new Date(newLead.next_follow_up)) {
      newErrors.next_follow_up = "Next follow up must be after date of meeting"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleEdit = (lead) => {
    setEditingLead(lead)
    setNewLead({
      ...lead,
      contact_name: lead.contact_name || "",
      services: Array.isArray(lead.services) ? lead.services : [],
      quotation_amount: lead.quotation_amount || "",
      source: lead.source || "",
      date_of_meeting: lead.date_of_meeting ? lead.date_of_meeting.split('T')[0] : "",
      next_follow_up: lead.next_follow_up ? lead.next_follow_up.split('T')[0] : "",
      notes: lead.notes || "",
      assigned_to: lead.assigned_to || null
    })
    setErrors({})
    setShowCreate(true)
  }

  const handleSubmit = () => {
    if (!validateForm()) {
      return
    }
    const payload = {
      ...newLead,
      services: newLead.services || [],
      quotation_amount: newLead.quotation_amount ? parseFloat(newLead.quotation_amount) : null
    }
    if (editingLead) {
      updateLead.mutate({ id: editingLead.id, data: payload })
    } else {
      createLead.mutate(payload)
    }
  }

  const handleCsvImport = () => {
    if (csvFile) {
      Papa.parse(csvFile, {
        header: true,
        complete: (results) => {
          importCsv.mutate(results.data)
        }
      })
    }
  }

  const handleCsvExport = () => {
    const csv = Papa.unparse(leads)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'leads.csv'
    link.click()
  }

  /* ---------- LOGIC ---------- */
  const filteredLeads = useMemo(() => {
    let filtered = leads.filter(l => {
      const matchSearch = l.company_name?.toLowerCase().includes(search.toLowerCase()) ||
                          l.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
                          l.email?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = statusFilter === "all" || l.status === statusFilter
      return matchSearch && matchStatus
    })

    filtered.sort((a, b) => {
      let valA = a[sortBy]
      let valB = b[sortBy]
      if (sortBy === "quotation_amount") {
        valA = Number(valA) || 0
        valB = Number(valB) || 0
      }
      if (sortOrder === "asc") {
        return valA > valB ? 1 : -1
      } else {
        return valA < valB ? 1 : -1
      }
    })

    return filtered
  }, [leads, search, statusFilter, sortBy, sortOrder])

  const counts = useMemo(() => {
    const map = { all: leads.length }
    PIPELINE_STAGES.forEach(p => {
      map[p.id] = leads.filter(l => l.status === p.id).length
    })
    return map
  }, [leads])

  const totalPipelineValue = useMemo(() => {
    return leads.reduce((acc, curr) => acc + (Number(curr.quotation_amount) || 0), 0)
  }, [leads])

  const wonToday = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd")
    return leads.filter(l => l.status === 'won' && format(new Date(l.updated_at || l.created_at), "yyyy-MM-dd") === today).length
  }, [leads])

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>Error loading leads: {error.message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6 lg:p-10">
        <div className="max-w-[1600px] mx-auto space-y-8">
          <Skeleton className="h-20 w-full" />
          <div className="flex gap-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-24" />)}
          </div>
          <Skeleton className="h-14 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F8FAFC] to-[#E8EBEF] p-6 lg:p-10">
      <div className="max-w-[1600px] mx-auto space-y-8">
        {/* EXECUTIVE HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-slate-200 pb-8">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Leads Engine</h1>
            <p className="text-slate-500 font-medium">Advanced pipeline management & conversion analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden xl:flex items-center gap-6 px-6 border-r border-slate-200 mr-4">
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Active Pipeline</p>
                <p className="text-xl font-black text-indigo-600">₹{totalPipelineValue.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Won Today</p>
                <p className="text-xl font-black text-emerald-600">{wonToday}</p>
              </div>
            </div>
            <Button variant="outline" className="h-12 px-6 rounded-2xl" onClick={handleCsvExport}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-12 px-6 rounded-2xl">
                  <Upload className="w-4 h-4 mr-2" /> Import CSV
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <Input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files[0])} />
                  <Button className="w-full" onClick={handleCsvImport} disabled={!csvFile || importCsv.isLoading}>
                    {importCsv.isLoading ? "Importing..." : "Upload and Import"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Dialog open={showCreate} onOpenChange={(open) => {
              setShowCreate(open)
              if (!open) {
                resetForm()
                setEditingLead(null)
              }
            }}>
              <DialogTrigger asChild>
                <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-100 px-8 transition-all hover:-translate-y-0.5">
                  <Plus className="w-5 h-5 mr-2 stroke-[3]" /> Create Lead
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto rounded-3xl border-none shadow-2xl bg-white">
                <DialogHeader className="pb-4">
                  <DialogTitle className="text-2xl font-bold text-slate-900">
                    {editingLead ? "Edit Lead" : "New Lead"}
                  </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                  {/* Contact */}
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Company Name <span className="text-red-500">*</span></Label>
                    <Input value={newLead.company_name} onChange={e => setNewLead({ ...newLead, company_name: e.target.value })} placeholder="Acme Corp" />
                    {errors.company_name && <p className="text-red-500 text-xs">{errors.company_name}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Contact Person <span className="text-red-500">*</span></Label>
                    <Input value={newLead.contact_name} onChange={e => setNewLead({ ...newLead, contact_name: e.target.value })} placeholder="Rahul Sharma" />
                    {errors.contact_name && <p className="text-red-500 text-xs">{errors.contact_name}</p>}
                  </div>

                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Email</Label>
                    <Input type="email" value={newLead.email} onChange={e => setNewLead({ ...newLead, email: e.target.value })} placeholder="rahul@acmecorp.in" />
                    {errors.email && <p className="text-red-500 text-xs">{errors.email}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Phone</Label>
                    <Input value={newLead.phone} onChange={e => setNewLead({ ...newLead, phone: e.target.value })} placeholder="+91 98765 43210" />
                    {errors.phone && <p className="text-red-500 text-xs">{errors.phone}</p>}
                  </div>

                  {/* Deal Info */}
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Quotation Amount (₹)</Label>
                    <Input type="number" value={newLead.quotation_amount} onChange={e => setNewLead({ ...newLead, quotation_amount: e.target.value })} placeholder="1250000" />
                    {errors.quotation_amount && <p className="text-red-500 text-xs">{errors.quotation_amount}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Source</Label>
                    <Select value={newLead.source} onValueChange={v => setNewLead({ ...newLead, source: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map(src => <SelectItem key={src} value={src}>{src}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Date of Meeting</Label>
                    <Input type="date" value={newLead.date_of_meeting} onChange={e => setNewLead({ ...newLead, date_of_meeting: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Next Follow Up</Label>
                    <Input type="date" value={newLead.next_follow_up} onChange={e => setNewLead({ ...newLead, next_follow_up: e.target.value })} />
                    {errors.next_follow_up && <p className="text-red-500 text-xs">{errors.next_follow_up}</p>}
                  </div>

                  {/* Status & Assignment */}
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Status</Label>
                    <Select value={newLead.status} onValueChange={v => setNewLead({ ...newLead, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STAGES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Assigned To</Label>
                    <Select value={newLead.assigned_to || ""} onValueChange={v => setNewLead({ ...newLead, assigned_to: v || null })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {users.map(u => <SelectItem key={u._id} value={u._id}>{u.name || u.username}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Services & Notes */}
                  <div className="md:col-span-2 space-y-1">
                    <Label className="font-bold text-slate-600">Services (comma separated)</Label>
                    <Input
                      placeholder="Website Development, SEO, Google Ads"
                      value={newLead.services?.join(", ") || ""}
                      onChange={e => setNewLead({
                        ...newLead,
                        services: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                      })}
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <Label className="font-bold text-slate-600">Notes</Label>
                    <Textarea
                      className="min-h-[110px] resize-y"
                      placeholder="Lead came from LinkedIn. Interested in full digital marketing package..."
                      value={newLead.notes}
                      onChange={e => setNewLead({ ...newLead, notes: e.target.value })}
                    />
                  </div>
                </div>

                <DialogFooter className="pt-6 border-t mt-4">
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={createLead.isLoading || updateLead.isLoading} className="bg-indigo-600 hover:bg-indigo-700">
                    {createLead.isLoading || updateLead.isLoading ? "Saving..." : editingLead ? "Update Lead" : "Create Lead"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* STATUS STICKER BAR */}
        <div className="sticky top-0 z-10 bg-[#F8FAFC]/90 backdrop-blur-sm flex items-center gap-4 py-2 px-4 overflow-x-auto scrollbar-hide border-b border-slate-100">
          <button
            onClick={() => setStatusFilter("all")}
            className={`flex items-center gap-3 shrink-0 py-2 px-4 transition-all rounded-full ${statusFilter === "all" ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <span className="text-sm font-bold uppercase tracking-widest">All</span>
            <div className="text-white text-[11px] font-black h-5 min-w-[28px] px-2 flex items-center justify-center rounded-full bg-indigo-600">
              {counts.all}
            </div>
          </button>
          {PIPELINE_STAGES.map((stage) => (
            <button
              key={stage.id}
              onClick={() => setStatusFilter(stage.id)}
              className={`flex items-center gap-3 shrink-0 py-2 px-4 transition-all rounded-full ${statusFilter === stage.id ? stage.color : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <span className="text-sm font-bold uppercase tracking-widest">
                {stage.label}
              </span>
              <div className="text-white text-[11px] font-black h-5 min-w-[28px] px-2 flex items-center justify-center rounded-full bg-slate-600">
                {counts[stage.id] || 0}
              </div>
            </button>
          ))}
        </div>

        {/* FILTER & TOOLS AREA */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-500 transition-colors" />
            <Input
              className="pl-12 h-14 bg-white border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-indigo-50 transition-all text-lg"
              placeholder="Search by company, contact, email or services..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px] h-14 rounded-2xl">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="company_name">Company Name</SelectItem>
              <SelectItem value="quotation_amount">Quote Amount</SelectItem>
              <SelectItem value="created_at">Created Date</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="w-[120px] h-14 rounded-2xl">
              <SelectValue placeholder="Order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-14 px-6 rounded-2xl border-slate-200 bg-white font-bold text-slate-600">
            <Filter className="w-4 h-4 mr-2" /> More Filters
          </Button>
        </div>

        {/* DATA GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
          <AnimatePresence mode='popLayout'>
            {filteredLeads.map((lead) => (
              <motion.div
                key={lead.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="group h-full border-none shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ring-1 ring-slate-200/60 bg-white rounded-[24px] overflow-hidden">
                  <CardHeader className="p-6 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-100">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 max-w-[70%]">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                          <CardTitle className="text-base font-black text-slate-800 truncate tracking-tight">{lead.company_name}</CardTitle>
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{lead.contact_name}</p>
                      </div>
                      <Badge className={cn("px-3 py-1 text-[10px] font-black uppercase", PIPELINE_STAGES.find(s => s.id === lead.status)?.color || "bg-gray-100 text-gray-700")}>
                        {PIPELINE_STAGES.find(s => s.id === lead.status)?.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Phone</span>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                          <Phone className="w-3.5 h-3.5 text-indigo-400" />
                          {lead.phone}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Email</span>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 truncate">
                          <Mail className="w-3.5 h-3.5 text-indigo-400" />
                          {lead.email || "N/A"}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Valuation</span>
                      <div className="text-lg font-black text-emerald-600">
                        ₹{(Number(lead.quotation_amount) || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 group-hover:bg-white transition-colors duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                          <History className="w-3 h-3 text-indigo-500" /> Latest Note
                        </span>
                        <span className="text-[10px] font-bold text-slate-300 italic">{format(new Date(lead.updated_at || lead.created_at), "MMM d, yyyy")}</span>
                      </div>
                      <p className="text-[13px] text-slate-600 leading-relaxed line-clamp-3">
                        {lead.notes || "No specific briefing notes attached to this lead profile."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.services?.map((s, i) => (
                        <Badge key={i} variant="secondary" className="text-[9px] font-black px-2 py-0.5 rounded-full">
                          {s}
                        </Badge>
                      )) || <span className="text-slate-400 text-xs">No services specified</span>}
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button className="text-slate-400 hover:text-indigo-600 transition-all transform hover:scale-110">
                          <MessageSquare className="w-5 h-5" />
                        </button>
                        <button className="text-slate-400 hover:text-indigo-600 transition-all transform hover:scale-110">
                          <Calendar className="w-5 h-5" />
                        </button>
                        <button onClick={() => handleEdit(lead)} className="text-slate-400 hover:text-indigo-600 transition-all transform hover:scale-110">
                          <Edit2 className="w-5 h-5" />
                        </button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl"
                        onClick={() => { if(window.confirm("Permanently delete this lead?")) deleteLead.mutate(lead.id) }}
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* EMPTY STATE */}
        {filteredLeads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="bg-white p-6 rounded-full shadow-sm ring-1 ring-slate-100">
              <Search className="w-10 h-10 text-slate-200" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-800">No matching leads found</h3>
              <p className="text-slate-400 max-w-xs mx-auto">Adjust your search or filters to find what you're looking for.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
