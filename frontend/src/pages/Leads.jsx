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

const LEAD_SOURCES = ["Website", "Referral", "LinkedIn", "Cold Call", "Event", "Social Media", "Other"]

export default function LeadsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

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
    status: "new"
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
      status: "new"
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
      company_name: lead.company_name || "",
      contact_name: lead.contact_name || null,
      email: lead.email || null,
      phone: lead.phone || null,
      quotation_amount: lead.quotation_amount || null,
      services: Array.isArray(lead.services) ? lead.services : [],
      source: lead.source || "direct",
      notes: lead.notes || null,
      assigned_to: lead.assigned_to || null,
      status: lead.status || "new"
    })
    setShowCreate(true)
  }

  const handleSubmit = () => {
    if (!newLead.company_name?.trim()) {
      setErrors({ company_name: "Company name is required" })
      return
    }

    const payload = {
      company_name: newLead.company_name?.trim() || "",
      contact_name: newLead.contact_name,
      email: newLead.email,
      phone: newLead.phone,
      quotation_amount: newLead.quotation_amount ? Number(newLead.quotation_amount) : null,
      services: Array.isArray(newLead.services) ? newLead.services : [],
      source: newLead.source || "direct",
      notes: newLead.notes,
      assigned_to: newLead.assigned_to,
      status: newLead.status || "new"
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
                        <SelectItem key={s} value={s.toLowerCase()}>
                          {s}
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

                <div className="md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={newLead.notes || ""}
                    onChange={e=>handleChange("notes",e.target.value)}
                  />
                </div>

              </div>

              <DialogFooter>
                <Button variant="outline" onClick={()=>setShowCreate(false)}>Cancel</Button>
                <Button onClick={handleSubmit} className="bg-indigo-600">
                  Save Lead
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
                    <CardTitle>{lead.company_name}</CardTitle>
                    <Badge>{lead.status}</Badge>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4"/> {lead.phone || "No Phone"}
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4"/> {lead.email || "No Email"}
                    </div>

                    <div className="font-bold text-green-600">
                      ₹{(Number(lead.quotation_amount)||0).toLocaleString()}
                    </div>

                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" onClick={()=>handleEdit(lead)}>
                        <Edit2 className="w-4 h-4"/>
                      </Button>

                      <Button size="icon" variant="ghost" onClick={()=>deleteLead.mutate(lead.id)}>
                        <Trash2 className="w-4 h-4"/>
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
