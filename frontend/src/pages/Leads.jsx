import React, { useState, useMemo, useEffect } from "react"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Phone,
  Mail,
  DollarSign,
  Trash2,
  Plus,
  Search,
  Calendar,
  User,
  MoreVertical,
  Sparkles,
  Download,
  Building2,
  MessageSquare,
  Clock,
  History
} from "lucide-react"

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue
} from "@/components/ui/select"

/* ---------- CONSTANTS ---------- */

const PIPELINE = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "meeting", label: "Meeting" },
  { id: "proposal", label: "Proposal" },
  { id: "negotiation", label: "Negotiation" },
  { id: "on_hold", label: "On Hold" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" }
]

export default function LeadsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [showCreate, setShowCreate] = useState(false)
  
  // State for Create Form
  const [newLead, setNewLead] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    quotation_amount: "",
    status: "new",
    last_note: ""
  })

  /* ---------- QUERIES & MUTATIONS ---------- */

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: () => api.get("/leads").then(res => res.data)
  })

  const createLead = useMutation({
    mutationFn: (data) => api.post("/leads", data),
    onSuccess: () => {
      queryClient.invalidateQueries(["leads"])
      setShowCreate(false)
      setNewLead({ company_name: "", contact_name: "", email: "", phone: "", quotation_amount: "", status: "new", last_note: "" })
    }
  })

  const updateLead = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/leads/${id}`, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(["leads"])
      const lead = res.data
      if (lead.status === "won") {
        api.post("/tasks", {
          title: `Client Onboarding - ${lead.company_name}`,
          description: "Convert lead to client",
          assigned_to: lead.assigned_to
        })
        api.post("/clients/from-lead", { lead_id: lead.id })
      }
    }
  })

  const deleteLead = useMutation({
    mutationFn: (id) => api.delete(`/leads/${id}`),
    onSuccess: () => queryClient.invalidateQueries(["leads"])
  })

  /* ---------- LOGIC ---------- */

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchSearch = l.company_name?.toLowerCase().includes(search.toLowerCase()) || 
                          l.contact_name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = statusFilter === "all" || l.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [leads, search, statusFilter])

  const counts = useMemo(() => {
    const map = {}
    PIPELINE.forEach(p => {
      map[p.id] = leads.filter(l => l.status === p.id).length
    })
    return map
  }, [leads])

  const exportCSV = () => {
    const csv = Papa.unparse(leads.map(l => ({
      Company: l.company_name, Contact: l.contact_name, Email: l.email,
      Phone: l.phone, Quote: l.quotation_amount, Status: l.status, LastNote: l.last_note
    })))
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "leads_export.csv"; a.click()
  }

  if (isLoading) return <div className="flex h-screen items-center justify-center font-medium text-slate-500">Initializing CRM...</div>

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* TOP NAV & ACTIONS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Leads Dashboard</h1>
            <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
               <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
               {leads.length} Total Leads Active
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="bg-white">
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
            
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button className="bg-[#0F172A] hover:bg-slate-800 text-white shadow-lg">
                  <Plus className="w-4 h-4 mr-2" /> Add New Lead
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Lead Entry</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <Input placeholder="Acme Corp" value={newLead.company_name} onChange={e => setNewLead({...newLead, company_name: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input placeholder="John Doe" value={newLead.contact_name} onChange={e => setNewLead({...newLead, contact_name: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input placeholder="+91..." value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Expected Quote (₹)</Label>
                      <Input type="number" placeholder="50000" value={newLead.quotation_amount} onChange={e => setNewLead({...newLead, quotation_amount: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Initial Note</Label>
                    <Textarea placeholder="How did they find us?" value={newLead.last_note} onChange={e => setNewLead({...newLead, last_note: e.target.value})} />
                  </div>
                </div>
                <Button className="w-full" onClick={() => createLead.mutate(newLead)} disabled={createLead.isLoading}>
                  {createLead.isLoading ? "Adding..." : "Confirm & Add Lead"}
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* STATUS BAR (ATTACHMENT STYLE) */}
        <div className="flex items-center gap-8 py-4 px-8 bg-white rounded-2xl shadow-sm border overflow-x-auto scrollbar-hide">
          {PIPELINE.map((stage) => (
            <button 
              key={stage.id} 
              onClick={() => setStatusFilter(stage.id)}
              className={`flex items-center gap-2 group transition-all shrink-0`}
            >
              <span className={`text-[13px] font-bold ${statusFilter === stage.id ? 'text-indigo-600' : 'text-slate-600 group-hover:text-slate-900'}`}>
                {stage.label}
              </span>
              <div className={`text-white text-[11px] font-bold h-6 min-w-[24px] px-1.5 flex items-center justify-center rounded-full transition-colors ${statusFilter === stage.id ? 'bg-indigo-600' : 'bg-[#0F365D]'}`}>
                {counts[stage.id] || 0}
              </div>
            </button>
          ))}
          {statusFilter !== "all" && (
             <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")} className="text-xs text-slate-400 ml-auto">
               Clear Filter
             </Button>
          )}
        </div>

        {/* SEARCH & AI INSIGHTS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 relative">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
             <Input 
                className="pl-12 h-12 bg-white border-slate-200 rounded-xl focus:ring-indigo-500 shadow-sm" 
                placeholder="Search leads by company, contact or services..."
                value={search}
                onChange={e => setSearch(e.target.value)}
             />
          </div>
          <div className="bg-indigo-600 text-white p-3 rounded-xl flex items-center gap-3 shadow-md">
            <Sparkles className="w-5 h-5 text-indigo-200" />
            <div className="text-xs">
              <p className="font-bold">AI Prediction</p>
              <p className="opacity-80">Leads with 'Proposal' stage have 85% higher win rate today.</p>
            </div>
          </div>
        </div>

        {/* LEADS LIST */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode='popLayout'>
            {filteredLeads.map((lead) => (
              <motion.div
                key={lead.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Card className="group h-full border-none shadow-sm hover:shadow-xl transition-all duration-300 ring-1 ring-slate-200 bg-white">
                  <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 group-hover:bg-indigo-50 transition-colors">
                        <Building2 className="w-5 h-5 text-slate-600 group-hover:text-indigo-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold text-slate-800 leading-tight">{lead.company_name}</CardTitle>
                        <span className="text-xs text-slate-500 font-medium">{lead.contact_name}</span>
                      </div>
                    </div>
                    <Select 
                      value={lead.status} 
                      onValueChange={(val) => updateLead.mutate({ id: lead.id, data: { status: val }})}
                    >
                      <SelectTrigger className="w-fit h-7 border-none bg-slate-100 text-[10px] font-bold uppercase tracking-wider px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 py-3 border-y border-slate-50">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{lead.phone}</span>
                      </div>
                      <div className="flex items-center gap-1 justify-end text-sm font-bold text-emerald-600">
                        ₹{Number(lead.quotation_amount).toLocaleString()}
                      </div>
                    </div>

                    {/* LAST FOLLOW-UP SECTION */}
                    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                       <div className="flex items-center justify-between">
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                           <History className="w-3 h-3" /> Last Activity
                         </span>
                         {lead.updated_at && (
                           <span className="text-[10px] text-slate-400">
                             {format(new Date(), "MMM d")}
                           </span>
                         )}
                       </div>
                       <p className="text-xs text-slate-600 line-clamp-2 italic">
                         {lead.last_note || "No notes recorded yet..."}
                       </p>
                    </div>

                    {/* SERVICES TAGS */}
                    <div className="flex flex-wrap gap-1.5">
                      {lead.services?.map((s, i) => (
                        <Badge key={i} variant="secondary" className="bg-indigo-50 text-indigo-600 border-none text-[9px] px-1.5 py-0">
                          {s}
                        </Badge>
                      ))}
                    </div>

                    {/* CARD FOOTER */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-3">
                         <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                           <MessageSquare className="w-4 h-4" />
                         </button>
                         <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                           <Calendar className="w-4 h-4" />
                         </button>
                      </div>
                      
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50"
                          onClick={() => { if(window.confirm("Delete this lead?")) deleteLead.mutate(lead.id) }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
