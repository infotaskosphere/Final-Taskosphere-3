import React, { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useAuth } from "@/contexts/AuthContext"
import api from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Phone, Mail, Trash2, Plus, Search, Edit2, TrendingUp, Check } from "lucide-react"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

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

// Must match backend LeadUpdate source Literal exactly (lowercased on send)
const LEAD_SOURCES = [
  { label: "Direct",       value: "direct"       },
  { label: "Website",      value: "website"      },
  { label: "Referral",     value: "referral"     },
  { label: "Social Media", value: "social_media" },
  { label: "Event",        value: "event"        },
]

export default function LeadsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // ─────────────────────────────────────────────────────────────
  // Permission Matrix — mirrors backend leads.py helpers:
  //   canDeleteLead  → Admin OR can_manage_users
  //                    (backend DELETE /leads requires Admin OR can_manage_users)
  //   canViewAll     → Admin OR can_view_all_leads
  //                    (backend _build_lead_query — non-admins without this flag
  //                     only see leads they are assigned_to OR created_by)
  //   canEditLead()  → Admin OR lead.assigned_to === user.id OR lead.created_by === user.id
  //                    (backend can_edit_lead — ownership check per record)
  // ─────────────────────────────────────────────────────────────
  const isAdmin      = user?.role === 'admin';
  const perms        = user?.permissions || {};
  const canDeleteLead = isAdmin || !!perms.can_manage_users;
  const canViewAll    = isAdmin || !!perms.can_view_all_leads;
  // Per-record edit: admin always, otherwise ownership (assigned_to or created_by)
  const canEditLead = (lead) =>
    isAdmin ||
    (lead?.assigned_to && lead.assigned_to === user?.id) ||
    (lead?.created_by  && lead.created_by  === user?.id);

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [showCreate, setShowCreate] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [availableServices, setAvailableServices] = useState([])
  const [errors, setErrors] = useState({})

  const [newLead, setNewLead] = useState({
    company_name: "",
    contact_name: null,
    email: null,
    phone: null,
    quotation_amount: null,
    services: [],
    source: "direct",
    notes: null,
    assigned_to: null,
    status: "new",
    next_follow_up: null,   // backend: rejects past dates
    date_of_meeting: null,
  })

  useEffect(() => {
    api.get("/leads/meta/services")
      .then(res => setAvailableServices(res.data))
      .catch(() => {})
  }, [])

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: () => api.get("/leads/").then(res => res.data)
  })

  const createLead = useMutation({
    mutationFn: (data) => api.post("/leads/", data),
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

  // Convert lead → client (backend POST /leads/{id}/convert)
  // Matrix: same as edit — Admin OR assigned_to OR created_by
  const convertLead = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/convert`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries(["leads"])
      toast.success("Lead converted to client successfully")
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || "Failed to convert lead")
    }
  })

  const resetForm = () => {
    setNewLead({
      company_name: "",
      contact_name: null,
      email: null,
      phone: null,
      quotation_amount: null,
      services: [],
      source: "direct",
      notes: null,
      assigned_to: null,
      status: "new",
      next_follow_up: null,
      date_of_meeting: null,
    })
    setErrors({})
  }

  const handleChange = (field, value) => {
    setNewLead(prev => ({
      ...prev,
      [field]: value === "" ? null : value
    }))
  }

  const handleEdit = (lead) => {
    setEditingLead(lead)
    setNewLead({
      company_name:     lead.company_name || "",
      contact_name:     lead.contact_name || null,
      email:            lead.email || null,
      phone:            lead.phone || null,
      quotation_amount: lead.quotation_amount || null,
      services:         Array.isArray(lead.services) ? lead.services : [],
      source:           lead.source || "direct",
      notes:            lead.notes || null,
      assigned_to:      lead.assigned_to || null,
      status:           lead.status || "new",
      next_follow_up:   lead.next_follow_up || null,
      date_of_meeting:  lead.date_of_meeting || null,
    })
    setShowCreate(true)
  }

  const handleSubmit = () => {
    if (!newLead.company_name?.trim()) {
      setErrors({ company_name: "Company name is required" })
      return
    }

    const payload = {
      company_name:     newLead.company_name?.trim() || "",
      contact_name:     newLead.contact_name   || null,
      email:            newLead.email          || null,
      phone:            newLead.phone          || null,
      quotation_amount: newLead.quotation_amount ? Number(newLead.quotation_amount) : null,
      services:         Array.isArray(newLead.services) ? newLead.services : [],
      source:           newLead.source         || "direct",
      notes:            newLead.notes          || null,
      assigned_to:      newLead.assigned_to    || null,
      status:           newLead.status         || "new",
      next_follow_up:   newLead.next_follow_up || null,
      date_of_meeting:  newLead.date_of_meeting|| null,
    }

    if (editingLead) {
      updateLead.mutate({ id: editingLead.id, data: payload })
    } else {
      createLead.mutate(payload)
    }
  }

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const s = search.toLowerCase()
      return (
        l.company_name?.toLowerCase().includes(s) ||
        l.contact_name?.toLowerCase().includes(s) ||
        l.email?.toLowerCase().includes(s)
      )
    }).filter(l => statusFilter === "all" || l.status === statusFilter)
  }, [leads, search, statusFilter])

  if (isLoading) return <div className="p-10"><Skeleton className="h-20 w-full" /></div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F8FAFC] to-[#E8EBEF] px-4 py-4 lg:px-6">
      <div className="max-w-[1500px] mx-auto space-y-6">

        <div className="flex justify-between items-end border-b pb-6">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900">Leads Engine</h1>
            <p className="text-slate-500">Pipeline management</p>
          </div>

          <Dialog open={showCreate} onOpenChange={(open)=>{
            setShowCreate(open)
            if(!open){ resetForm(); setEditingLead(null) }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 text-white">
                <Plus className="w-5 h-5 mr-2"/> Create Lead
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[680px]">
              <DialogHeader>
                <DialogTitle>{editingLead ? "Edit Lead" : "Create Lead"}</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">

                <div>
                  <Label>Company Name *</Label>
                  <Input
                    value={newLead.company_name || ""}
                    onChange={e=>handleChange("company_name",e.target.value)}
                  />
                </div>

                <div>
                  <Label>Contact Person</Label>
                  <Input
                    value={newLead.contact_name || ""}
                    onChange={e=>handleChange("contact_name",e.target.value)}
                  />
                </div>

                <div>
                  <Label>Email</Label>
                  <Input
                    value={newLead.email || ""}
                    onChange={e=>handleChange("email",e.target.value)}
                  />
                </div>

                <div>
                  <Label>Phone</Label>
                  <Input
                    value={newLead.phone || ""}
                    onChange={e=>handleChange("phone",e.target.value)}
                  />
                </div>

                <div>
                  <Label>Quotation</Label>
                  <Input
                    type="number"
                    value={newLead.quotation_amount ?? ""}
                    onChange={e=>handleChange("quotation_amount",e.target.value)}
                  />
                </div>

                <div>
                  <Label>Lead Source</Label>
                  <Select
                    value={newLead.source || "direct"}
                    onValueChange={(v)=>handleChange("source",v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Source"/>
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map(s=>(
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <Label>Services</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableServices.map(service=>(
                      <button
                        key={service}
                        type="button"
                        onClick={()=>{
                          const exists=newLead.services.includes(service)
                          setNewLead(prev=>({
                            ...prev,
                            services:exists
                              ? prev.services.filter(s=>s!==service)
                              : [...prev.services,service]
                          }))
                        }}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold",
                          newLead.services.includes(service)
                            ?"bg-indigo-600 text-white"
                            :"bg-gray-100"
                        )}
                      >
                        {service}
                        {newLead.services.includes(service) && <Check className="w-3 h-3 ml-1"/>}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Next Follow-up Date</Label>
                  {/* Backend rejects past dates for next_follow_up */}
                  <Input
                    type="datetime-local"
                    value={newLead.next_follow_up
                      ? newLead.next_follow_up.slice(0,16)
                      : ""}
                    onChange={e => handleChange("next_follow_up", e.target.value ? new Date(e.target.value).toISOString() : null)}
                  />
                </div>

                <div>
                  <Label>Date of Meeting</Label>
                  <Input
                    type="datetime-local"
                    value={newLead.date_of_meeting
                      ? newLead.date_of_meeting.slice(0,16)
                      : ""}
                    onChange={e => handleChange("date_of_meeting", e.target.value ? new Date(e.target.value).toISOString() : null)}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={newLead.notes || ""}
                    onChange={e=>handleChange("notes",e.target.value)}
                    placeholder="Notes affect closure probability score automatically..."
                  />
                </div>

              </div>

              {/* Status selector — shown only on edit. "won" blocked by backend unless via /convert */}
              {editingLead && (
                <div className="px-1">
                  <Label>Pipeline Stage</Label>
                  <Select value={newLead.status} onValueChange={v => handleChange("status", v)}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      {PIPELINE_STAGES.filter(s => s.id !== 'won').map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    To mark as "Won" use the Convert button on the lead card.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={()=>setShowCreate(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createLead.isPending || updateLead.isPending} className="bg-indigo-600">
                  {createLead.isPending || updateLead.isPending ? "Saving..." : "Save Lead"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-4">
          <Input
            placeholder="Search..."
            value={search}
            onChange={e=>setSearch(e.target.value)}
          />

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status"/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {/* Matches backend LeadBase status Literal exactly */}
              {PIPELINE_STAGES.map(s=>(
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          <AnimatePresence>
            {filteredLeads.map(lead=>(
              <motion.div key={lead.id} layout>
                <Card className="shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{lead.company_name}</CardTitle>
                      {/* Color-coded stage badge using PIPELINE_STAGES config */}
                      <Badge className={PIPELINE_STAGES.find(s=>s.id===lead.status)?.color || ''}>
                        {PIPELINE_STAGES.find(s=>s.id===lead.status)?.label || lead.status}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4"/> {lead.phone || "No Phone"}
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4"/> {lead.email || "No Email"}
                    </div>

                    {/* Follow-up date — backend stores as ISO datetime */}
                    {lead.next_follow_up && (
                      <div className={`flex items-center gap-2 text-xs font-medium ${
                        new Date(lead.next_follow_up) < new Date() ? 'text-red-500' : 'text-slate-500'
                      }`}>
                        <span>📅 Follow-up: {format(new Date(lead.next_follow_up), 'dd MMM yyyy')}</span>
                        {new Date(lead.next_follow_up) < new Date() && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold">OVERDUE</span>}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="font-bold text-green-600">
                        ₹{(Number(lead.quotation_amount)||0).toLocaleString()}
                      </span>
                      {/* Show closure_probability if available (backend auto-calculates from notes) */}
                      {lead.closure_probability != null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          lead.closure_probability >= 70 ? 'bg-green-100 text-green-700'
                          : lead.closure_probability >= 40 ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-600'
                        }`}>
                          {lead.closure_probability}% close
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {/* Convert button — only shown when lead is not yet won/lost */}
                      {canEditLead(lead) && !['won','lost'].includes(lead.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 text-xs"
                          disabled={convertLead.isPending}
                          onClick={() => {
                            if (window.confirm(`Convert "${lead.company_name}" to a client? This will mark the lead as Won.`)) {
                              convertLead.mutate(lead.id)
                            }
                          }}
                        >
                          <TrendingUp className="w-3 h-3 mr-1"/> Convert
                        </Button>
                      )}
                      {/* Matrix: Admin OR assigned_to OR created_by can edit */}
                      {canEditLead(lead) && (
                        <Button size="icon" variant="ghost" onClick={()=>handleEdit(lead)}>
                          <Edit2 className="w-4 h-4"/>
                        </Button>
                      )}

                      {/* Matrix: Admin OR can_manage_users can delete leads */}
                      {canDeleteLead && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 hover:bg-red-50"
                          onClick={() => {
                            if (window.confirm(`Delete lead "${lead.company_name}"? This cannot be undone.`)) {
                              deleteLead.mutate(lead.id)
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4"/>
                        </Button>
                      )}
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
