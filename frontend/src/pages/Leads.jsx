import React, {useState,useMemo,useEffect} from "react"
import {motion} from "framer-motion"
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query"
import {format} from "date-fns"
import Papa from "papaparse"

import {useAuth} from "@/contexts/AuthContext"
import api from "@/lib/api"

import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {Badge} from "@/components/ui/badge"
import {Checkbox} from "@/components/ui/checkbox"

import {
Select,
SelectTrigger,
SelectContent,
SelectItem,
SelectValue
} from "@/components/ui/select"

import {
Phone,
Mail,
DollarSign,
Trash2,
Plus,
Search,
Calendar,
User
} from "lucide-react"


/* ---------- PIPELINE STAGES ---------- */

const PIPELINE = [
"new",
"contacted",
"meeting",
"proposal",
"negotiation",
"on_hold",
"won",
"lost"
]


/* ---------- SERVICES ---------- */

const SERVICES = [
{value:"gst",label:"GST"},
{value:"income_tax",label:"Income Tax"},
{value:"accounts",label:"Accounts"},
{value:"roc",label:"ROC"},
{value:"tds",label:"TDS"},
{value:"fema",label:"FEMA"},
{value:"trademark",label:"Trademark"},
{value:"dsc",label:"DSC"}
]


/* ---------- MAIN PAGE ---------- */

export default function LeadsPage(){

const {user} = useAuth()
const queryClient = useQueryClient()

const [search,setSearch] = useState("")
const [statusFilter,setStatusFilter] = useState("all")

const [selectedLead,setSelectedLead] = useState(null)

const [showCreate,setShowCreate] = useState(false)


/* ---------- FETCH LEADS ---------- */

const {data:leads=[],isLoading} = useQuery({
queryKey:["leads"],
queryFn:()=>api.get("/leads").then(res=>res.data)
})


const {data:users=[]} = useQuery({
queryKey:["users"],
queryFn:()=>api.get("/users").then(res=>res.data)
})


/* ---------- CREATE LEAD ---------- */

const createLead = useMutation({
mutationFn:(data)=>api.post("/leads",data),

onSuccess:()=>{
queryClient.invalidateQueries(["leads"])
setShowCreate(false)
}
})


/* ---------- UPDATE LEAD ---------- */

const updateLead = useMutation({
mutationFn:({id,data})=>api.patch(`/leads/${id}`,data),

onSuccess:(res)=>{

queryClient.invalidateQueries(["leads"])

const lead = res.data

if(lead.status==="won"){

/* create task */

api.post("/tasks",{
title:`Client Onboarding - ${lead.company_name}`,
description:"Convert lead to client",
assigned_to:lead.assigned_to
})

/* convert to client */

api.post("/clients/from-lead",{
lead_id:lead.id
})

}

}
})


/* ---------- DELETE ---------- */

const deleteLead = useMutation({
mutationFn:(id)=>api.delete(`/leads/${id}`),

onSuccess:()=>{
queryClient.invalidateQueries(["leads"])
}
})



/* ---------- FILTER ---------- */

const filtered = useMemo(()=>{

return leads.filter(l=>{

const matchSearch =
l.company_name?.toLowerCase().includes(search.toLowerCase())

const matchStatus =
statusFilter==="all" || l.status===statusFilter

return matchSearch && matchStatus

})

},[leads,search,statusFilter])



/* ---------- PIPELINE ---------- */

const pipeline = useMemo(()=>{

const map={}

PIPELINE.forEach(p=>map[p]=[])

filtered.forEach(l=>{
map[l.status || "new"].push(l)
})

return map

},[filtered])



/* ---------- CSV EXPORT ---------- */

const exportCSV=()=>{

const csv = Papa.unparse(

leads.map(l=>({

Company:l.company_name,
Contact:l.contact_name,
Email:l.email,
Phone:l.phone,
Quote:l.quotation_amount,
Status:l.status

}))

)

const blob = new Blob([csv])
const url = URL.createObjectURL(blob)

const a=document.createElement("a")
a.href=url
a.download="leads.csv"
a.click()

}



/* ---------- FOLLOW UP ALERT ---------- */

useEffect(()=>{

const due = leads.filter(l=>{

if(!l.next_follow_up) return false

return new Date(l.next_follow_up) < new Date()

})

if(due.length>0){

console.warn(`${due.length} leads require follow-up`)

}

},[leads])



if(isLoading) return <div className="p-10">Loading...</div>



return(

<div className="p-6 space-y-6">


{/* HEADER */}

<div className="flex justify-between flex-wrap gap-4">

<h1 className="text-3xl font-bold">
Leads CRM
</h1>


<div className="flex gap-3 flex-wrap">

<Input
placeholder="Search leads"
value={search}
onChange={(e)=>setSearch(e.target.value)}
className="w-60"
/>


<Select
value={statusFilter}
onValueChange={setStatusFilter}
>

<SelectTrigger className="w-40">
<SelectValue/>
</SelectTrigger>

<SelectContent>

<SelectItem value="all">All</SelectItem>

{PIPELINE.map(s=>(
<SelectItem key={s} value={s}>
{s}
</SelectItem>
))}

</SelectContent>

</Select>


<Button variant="outline" onClick={exportCSV}>
Export CSV
</Button>


<Button onClick={()=>setShowCreate(true)}>
<Plus className="w-4 h-4 mr-2"/>
Add Lead
</Button>

</div>

</div>



{/* PIPELINE */}

<div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-8 gap-4">


{PIPELINE.map(stage=>(

<div key={stage} className="bg-slate-50 rounded-xl p-3">

<div className="flex justify-between mb-3">

<h3 className="font-semibold capitalize">
{stage.replace("_"," ")}
</h3>

<Badge>
{pipeline[stage]?.length}
</Badge>

</div>


<div className="space-y-3">

{pipeline[stage]?.map(lead=>(

<motion.div
key={lead.id}
whileHover={{scale:1.02}}
className="bg-white p-4 rounded-xl border shadow-sm space-y-2"
>


{/* NAME */}

<div>

<h4 className="font-semibold">
{lead.company_name}
</h4>

<p className="text-sm text-slate-500">
{lead.contact_name}
</p>

</div>



{/* PHONE */}

<div className="flex items-center text-sm gap-2 text-slate-600">

<Phone className="w-4 h-4"/>

{lead.phone}

</div>



{/* EMAIL */}

<div className="flex items-center text-sm gap-2 text-slate-600">

<Mail className="w-4 h-4"/>

{lead.email || "—"}

</div>



{/* QUOTATION */}

<div className="flex items-center text-sm gap-2">

<DollarSign className="w-4 h-4 text-green-600"/>

₹{lead.quotation_amount || "Not quoted"}

</div>



{/* SERVICES */}

<div className="flex flex-wrap gap-1">

{lead.services?.map((s,i)=>(
<Badge key={i} variant="outline">
{s}
</Badge>
))}

</div>



{/* FOLLOWUP */}

{lead.next_follow_up && (

<div className="text-xs text-amber-600 flex items-center gap-2">

<Calendar className="w-3 h-3"/>

Follow-up {format(new Date(lead.next_follow_up),"MMM d")}

</div>

)}



{/* FOOTER */}

<div className="flex justify-between pt-2">

<Badge className="capitalize">
{lead.status}
</Badge>

<Button
size="icon"
variant="ghost"
onClick={()=>deleteLead.mutate(lead.id)}
>

<Trash2 className="w-4 h-4 text-red-500"/>

</Button>

</div>

</motion.div>

))}

</div>

</div>

))}

</div>

</div>

)

}
