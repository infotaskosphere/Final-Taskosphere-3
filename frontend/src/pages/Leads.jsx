import React, { useState, useMemo, useEffect } from "react" // Added useEffect
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
  MessageSquare, History, TrendingUp, Filter, ArrowUpRight, Edit2, Download, Upload, Check
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
  
  // NEW: State for dynamic services from backend
  const [availableServices, setAvailableServices] = useState([])

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
  
  // NEW: Fetch dynamic services on mount
  useEffect(() => {
    api.get("/leads/meta/services")
      .then(res => setAvailableServices(res.data))
      .catch(err => console.error("Could not fetch services", err))
  }, [])

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ["leads"],
    queryFn: () => api.get("/leads/").then(res => res.data) // Added trailing slash
  })

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then(res => res.data)
  })

  const createLead = useMutation({
    mutationFn: (data) => api.post("/leads/", data), // Added trailing slash
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
  const handleCsvImport = async () => {
    if (!csvFile) return;

    // 1. Create FormData object to handle the file upload
    const formData = new FormData();
    formData.append("file", csvFile);

    try {
      // 2. Trigger the mutation with the FormData
      await importCsv.mutateAsync(formData);
      alert("Leads imported successfully!");
      setCsvFile(null); // Clear file after success
    } catch (err) {
      console.error("Import failed:", err);
      alert("Import failed: " + (err.response?.data?.detail || "Unknown error"));
    }
  };
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
    if (!newLead.company_name?.trim()) {
      newErrors.company_name = "Company name is required"
    }
    // contact_name removed as required to match backend (Optional[str]) 
    // but kept here if you want it mandatory in UI
    if (!newLead.contact_name?.trim()) {
      newErrors.contact_name = "Contact person is required"
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
    if (!validateForm()) return

    const payload = {
      ...newLead,
      // Ensure quotation is a float or null, not an empty string
      quotation_amount: newLead.quotation_amount !== "" ? parseFloat(newLead.quotation_amount) : null,
      // Ensure dates are valid ISO or null
      date_of_meeting: newLead.date_of_meeting ? new Date(newLead.date_of_meeting).toISOString() : null,
      next_follow_up: newLead.next_follow_up ? new Date(newLead.next_follow_up).toISOString() : null,
    }

    if (editingLead) {
      updateLead.mutate({ id: editingLead.id, data: payload })
    } else {
      createLead.mutate(payload)
    }
  }

  /* ---------- LOGIC ---------- */
  const filteredLeads = useMemo(() => {
    let filtered = leads.filter(l => {
      const matchSearch = l.company_name?.toLowerCase().includes(search.toLowerCase()) ||
                          l.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
                          l.email?.toLowerCase().includes(search.toLowerCase()) ||
                          l.services?.some(s => s.toLowerCase().includes(search.toLowerCase()))
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
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1)
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

  if (isLoading) return <div className="p-10"><Skeleton className="h-20 w-full" /></div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F8FAFC] to-[#E8EBEF] px-4 py-4 lg:px-6 overflow-x-hidden">
      <div className="max-w-[1500px] mx-auto space-y-6 px-2">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Leads Engine</h1>
            <p className="text-slate-500 font-medium">Advanced pipeline management & conversion analytics</p>
          </div>
          
          <div className="flex items-center gap-3">
             {/* Stats Cards Hidden on Mobile */}
            <div className="hidden xl:flex items-center gap-6 px-6 border-r border-slate-200 mr-4">
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Active Pipeline</p>
                <p className="text-xl font-black text-indigo-600">₹{totalPipelineValue.toLocaleString()}</p>
              </div>
            </div>

            <Dialog open={showCreate} onOpenChange={(open) => {
              setShowCreate(open)
              if (!open) { resetForm(); setEditingLead(null); }
            }}>
              <DialogTrigger asChild>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5">
                  <Plus className="w-5 h-5 mr-2 stroke-[3]" /> Create Lead
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[680px] rounded-3xl bg-white">
                <DialogHeader>
                  <DialogTitle>{editingLead ? "Edit Lead Profile" : "Initialize New Lead"}</DialogTitle>
                </DialogHeader>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                  {/* Company Name - CRITICAL FIX */}
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Company Name *</Label>
                    <Input 
                        value={newLead.company_name} 
                        onChange={e => setNewLead({ ...newLead, company_name: e.target.value })} 
                        placeholder="e.g. Mahadev Ice Cream"
                        className={errors.company_name ? "border-red-500" : ""}
                    />
                    {errors.company_name && <p className="text-red-500 text-[10px] font-bold uppercase">{errors.company_name}</p>}
                  </div>

                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Contact Person *</Label>
                    <Input value={newLead.contact_name} onChange={e => setNewLead({ ...newLead, contact_name: e.target.value })} placeholder="Client Name" />
                  </div>

                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Email</Label>
                    <Input type="email" value={newLead.email} onChange={e => setNewLead({ ...newLead, email: e.target.value })} placeholder="client@example.com" />
                  </div>

                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Phone</Label>
                    <Input value={newLead.phone} onChange={e => setNewLead({ ...newLead, phone: e.target.value })} placeholder="+91 ..." />
                  </div>

                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Quotation (₹)</Label>
                    <Input type="number" value={newLead.quotation_amount} onChange={e => setNewLead({ ...newLead, quotation_amount: e.target.value })} />
                  </div>

                  <div className="space-y-1">
                    <Label className="font-bold text-slate-600">Lead Source</Label>
                    <Select value={newLead.source} onValueChange={v => setNewLead({ ...newLead, source: v })}>
                      <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map(s => <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* MULTI-SELECT SERVICES DROPDOWN */}
                  <div className="md:col-span-2 space-y-2">
                    <Label className="font-bold text-slate-600">Services Required</Label>
                    <div className="flex flex-wrap gap-2 p-3 border rounded-xl bg-slate-50 min-h-[50px]">
                      {availableServices.map((service) => (
                        <button
                          key={service}
                          type="button"
                          onClick={() => {
                            const isSelected = newLead.services.includes(service)
                            setNewLead({
                              ...newLead,
                              services: isSelected 
                                ? newLead.services.filter(s => s !== service)
                                : [...newLead.services, service]
                            })
                          }}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all",
                            newLead.services.includes(service) 
                              ? "bg-indigo-600 text-white shadow-md" 
                              : "bg-white text-slate-500 border border-slate-200 hover:border-indigo-300"
                          )}
                        >
                          {service}
                          {newLead.services.includes(service) && <Check className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <Label className="font-bold text-slate-600">Notes & Briefing</Label>
                    <Textarea 
                        value={newLead.notes} 
                        onChange={e => setNewLead({ ...newLead, notes: e.target.value })} 
                        placeholder="Add specific requirements or meeting outcomes..."
                        className="min-h-[100px] rounded-xl"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button onClick={handleSubmit} className="bg-indigo-600">
                    {createLead.isLoading ? "Creating..." : "Save Lead"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* SEARCH & FILTERS */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 relative group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-500" />
            <Input
              className="pl-10 h-12 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="Search across pipeline..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[160px] h-12 rounded-2xl bg-white border-none shadow-sm">
                    <SelectValue placeholder="All Stages" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {PIPELINE_STAGES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
          </div>
        </div>

        {/* DATA GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          <AnimatePresence mode='popLayout'>
            {filteredLeads.map((lead) => (
              <motion.div key={lead.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="h-full border-none shadow-md hover:shadow-xl transition-all rounded-[24px] bg-white overflow-hidden group">
                  <CardHeader className="p-5 bg-slate-50/50 border-b border-slate-100">
                    <div className="flex justify-between items-start">
                      <div className="max-w-[70%]">
                        <CardTitle className="text-base font-black truncate">{lead.company_name}</CardTitle>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{lead.contact_name}</p>
                      </div>
                      <Badge className={cn("text-[9px] font-black uppercase px-2 py-1", PIPELINE_STAGES.find(s => s.id === lead.status)?.color)}>
                        {lead.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between text-lg font-black text-emerald-600">
                        <span>₹{(Number(lead.quotation_amount) || 0).toLocaleString()}</span>
                        <TrendingUp className="w-4 h-4" />
                    </div>
                    
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-indigo-400" /> {lead.phone || "No Phone"}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 truncate">
                            <Mail className="w-3.5 h-3.5 text-indigo-400" /> {lead.email || "No Email"}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                        {lead.services?.map((s, i) => (
                            <Badge key={i} variant="outline" className="text-[8px] font-bold border-slate-200">
                                {s}
                            </Badge>
                        ))}
                    </div>

                    <div className="pt-4 border-t flex justify-between">
                         <Button variant="ghost" size="icon" onClick={() => handleEdit(lead)} className="text-slate-400 hover:text-indigo-600">
                             <Edit2 className="w-4 h-4" />
                         </Button>
                         <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => { if(window.confirm("Delete lead?")) deleteLead.mutate(lead.id) }} 
                            className="text-slate-400 hover:text-red-500"
                        >
                             <Trash2 className="w-4 h-4" />
                         </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
