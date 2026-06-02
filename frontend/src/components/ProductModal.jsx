const ProductModal = ({ open, onClose, isDark, onSaved, invoices = [] }) => {
  const emptyForm = { name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true, color: 'blue', notes: '', discount: 0 };
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState('grid'); // 'list' | 'grid'
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'add' | 'analytics'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [priceRangeFilter, setPriceRangeFilter] = useState('all'); // 'all' | 'low' | 'mid' | 'high'
  const [gstFilter, setGstFilter] = useState('all');

  const fetchProducts = () => api.get('/products').then(r => setProducts(r.data || [])).catch(() => {});
  useEffect(() => {
    if (open) { fetchProducts(); setForm(emptyForm); setEditing(null); setSearch(''); setSelectedIds(new Set()); }
  }, [open]);

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error('Service name is required'); return; }
    setLoading(true);
    try {
      if (editing) await api.put(`/products/${editing.id}`, form);
      else await api.post('/products', form);
      toast.success(editing ? 'Updated!' : 'Added!');
      fetchProducts(); setForm(emptyForm); setEditing(null); onSaved?.();
      if (!editing) setActiveTab('catalog');
    } catch { toast.error('Failed to save'); }
    finally { setLoading(false); }
  };

  const handleEdit = (p) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description || '', hsn_sac: p.hsn_sac || '', unit: p.unit || 'service', unit_price: p.unit_price || 0, gst_rate: p.gst_rate || 18, category: p.category || '', is_service: p.is_service !== false, color: p.color || 'blue', notes: p.notes || '', discount: p.discount || 0 });
    setActiveTab('add');
  };

  const handleDelete = async (id) => {
    try { await api.delete(`/products/${id}`); setProducts(p => p.filter(x => x.id !== id)); toast.success('Deleted'); if (editing?.id === id) { setEditing(null); setForm(emptyForm); } }
    catch { toast.error('Failed'); }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    try {
      await Promise.all([...selectedIds].map(id => api.delete(`/products/${id}`)));
      toast.success(`Deleted ${selectedIds.size} items`);
      setProducts(p => p.filter(x => !selectedIds.has(x.id)));
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    } catch { toast.error('Some deletes failed'); }
  };

  const handleDuplicate = async (p) => {
    try {
      await api.post('/products', { ...p, id: undefined, name: `${p.name} (Copy)` });
      toast.success('Duplicated!'); fetchProducts();
    } catch { toast.error('Failed to duplicate'); }
  };

  const handleImport = () => {
    const existing = new Set(products.map(p => p.name?.trim().toLowerCase()));
    const toAdd = [];
    (invoices || []).forEach(inv => (inv.items || []).forEach(it => {
      const name = (it.description || '').trim();
      if (name && !existing.has(name.toLowerCase())) {
        existing.add(name.toLowerCase());
        toAdd.push({ name, description: '', hsn_sac: it.hsn_sac || '', unit: it.unit || 'service', unit_price: it.unit_price || 0, gst_rate: it.gst_rate || 18, category: '', is_service: true, color: 'blue', notes: '', discount: 0 });
      }
    }));
    if (!toAdd.length) { toast.info('No new services found in invoices'); return; }
    Promise.all(toAdd.map(s => api.post('/products', s))).then(() => { toast.success(`Imported ${toAdd.length} service${toAdd.length > 1 ? 's' : ''}`); fetchProducts(); onSaved?.(); }).catch(() => toast.error('Some imports failed'));
  };

  const handleExportCSV = () => {
    const rows = [['Name', 'Description', 'Type', 'Category', 'Unit', 'Unit Price', 'GST %', 'Discount %', 'HSN/SAC', 'Notes']];
    products.forEach(p => rows.push([p.name, p.description || '', p.is_service ? 'Service' : 'Product', p.category || '', p.unit || '', p.unit_price || 0, p.gst_rate || 18, p.discount || 0, p.hsn_sac || '', p.notes || '']));
    const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catalog'); XLSX.writeFile(wb, 'service_catalog.xlsx');
    toast.success('Exported!');
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.id)));
  };

  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))], [products]);
  const gstRates = useMemo(() => [...new Set(products.map(p => p.gst_rate).filter(r => r !== undefined && r !== null))].sort((a,b) => a - b), [products]);

  const analytics = useMemo(() => {
    const totalRevenue = (invoices || []).reduce((sum, inv) =>
      sum + (inv.items || []).reduce((s, it) => {
        const match = products.find(p => p.name?.toLowerCase() === it.description?.toLowerCase());
        return match ? s + ((it.unit_price || 0) * (it.quantity || 1)) : s;
      }, 0), 0);
    const serviceUsage = {};
    (invoices || []).forEach(inv => (inv.items || []).forEach(it => {
      const key = (it.description || '').trim();
      if (key) serviceUsage[key] = (serviceUsage[key] || 0) + 1;
    }));
    const topServices = Object.entries(serviceUsage).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const avgPrice = products.length ? Math.round(products.reduce((s, p) => s + (p.unit_price || 0), 0) / products.length) : 0;
    const byCategory = categories.map(cat => ({ cat, count: products.filter(p => p.category === cat).length })).sort((a,b) => b.count - a.count);
    return { totalRevenue, topServices, totalProducts: products.length, services: products.filter(p => p.is_service !== false).length, goods: products.filter(p => p.is_service === false).length, avgPrice, byCategory };
  }, [products, invoices, categories]);

  const filtered = useMemo(() => {
    let list = products;
    if (filterType !== 'all') list = list.filter(p => filterType === 'service' ? p.is_service !== false : p.is_service === false);
    if (filterCat !== 'all') list = list.filter(p => (p.category || '') === filterCat);
    if (gstFilter !== 'all') list = list.filter(p => String(p.gst_rate) === gstFilter);
    if (priceRangeFilter !== 'all') {
      if (priceRangeFilter === 'low') list = list.filter(p => (p.unit_price || 0) < 1000);
      else if (priceRangeFilter === 'mid') list = list.filter(p => (p.unit_price || 0) >= 1000 && (p.unit_price || 0) < 10000);
      else if (priceRangeFilter === 'high') list = list.filter(p => (p.unit_price || 0) >= 10000);
    }
    if (search) list = list.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()) || p.hsn_sac?.includes(search) || p.category?.toLowerCase().includes(search.toLowerCase()));
    if (sortBy === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'price_asc') list = [...list].sort((a, b) => (a.unit_price || 0) - (b.unit_price || 0));
    else if (sortBy === 'price_desc') list = [...list].sort((a, b) => (b.unit_price || 0) - (a.unit_price || 0));
    else if (sortBy === 'gst') list = [...list].sort((a, b) => (b.gst_rate || 0) - (a.gst_rate || 0));
    else if (sortBy === 'category') list = [...list].sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    return list;
  }, [products, search, filterCat, filterType, sortBy, priceRangeFilter, gstFilter]);

  const inputCls = `h-9 rounded-xl text-sm px-3 border w-full focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition-all ${isDark ? 'bg-slate-700 text-slate-100 border-slate-600 placeholder-slate-400' : 'bg-white text-slate-800 border-slate-200 placeholder-slate-400'}`;
  const labelCls = 'text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block';

  const tabBtn = (id, label, icon) => (
    <button onClick={() => setActiveTab(id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === id ? (isDark ? 'bg-slate-700 text-slate-100 shadow' : 'bg-white text-slate-800 shadow') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}>
      {icon}{label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-5xl max-h-[94vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">Service Catalog</DialogTitle>
        <DialogDescription className="sr-only">Manage your services and products catalog</DialogDescription>

        {/* ── HEADER ── */}
        <div className={`px-5 py-3.5 border-b flex items-center justify-between flex-shrink-0 ${isDark ? 'border-slate-700' : 'border-slate-100'}`} style={{ background: isDark ? undefined : `linear-gradient(135deg, ${COLORS.deepBlue}08 0%, ${COLORS.mediumBlue}05 100%)` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              <Layers className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className={`font-bold text-base leading-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Service Catalog</h2>
              <p className="text-[11px] text-slate-400">{analytics.services} services · {analytics.goods} products · avg ₹{analytics.avgPrice.toLocaleString('en-IN')}</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className={`flex items-center rounded-xl p-1 gap-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
            {tabBtn('catalog', 'Catalog', <Package style={{ width: 13, height: 13 }} />)}
            {tabBtn('add', editing ? 'Edit Item' : 'Add New', <Plus style={{ width: 13, height: 13 }} />)}
            {tabBtn('analytics', 'Analytics', <PieChart style={{ width: 13, height: 13 }} />)}
          </div>

          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={handleImport} className={`h-8 px-3 text-xs rounded-xl gap-1.5 ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}`}>
              <Download className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCSV} className={`h-8 px-3 text-xs rounded-xl gap-1.5 ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}`}>
              <FileDown className="h-3.5 w-3.5" /> Export
            </Button>
            <button onClick={onClose} className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* ── CATALOG TAB ── */}
        {activeTab === 'catalog' && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* Filters bar */}
            <div className={`px-4 py-2.5 border-b flex flex-wrap items-center gap-2 flex-shrink-0 ${isDark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-100 bg-slate-50/60'}`}>
              {/* Search */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  className={`h-8 pl-8 pr-3 rounded-xl text-xs border w-full focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition-all ${isDark ? 'bg-slate-700 text-slate-100 border-slate-600 placeholder-slate-400' : 'bg-white text-slate-800 border-slate-200 placeholder-slate-400'}`}
                  placeholder="Search name, HSN, category…"
                  value={search} onChange={e => setSearch(e.target.value)}
                />
                {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
              </div>

              {/* Type filter */}
              <div className={`flex rounded-xl p-0.5 gap-0.5 flex-shrink-0 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                {[['all', 'All'], ['service', 'Services'], ['product', 'Products']].map(([v, l]) => (
                  <button key={v} onClick={() => setFilterType(v)} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${filterType === v ? (isDark ? 'bg-slate-900 text-slate-100 shadow' : 'bg-white text-slate-800 shadow') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}>{l}</button>
                ))}
              </div>

              {/* Price range */}
              <select value={priceRangeFilter} onChange={e => setPriceRangeFilter(e.target.value)} className={`h-8 px-2 rounded-xl text-xs border flex-shrink-0 focus:outline-none ${isDark ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                <option value="all">All Prices</option>
                <option value="low">Under ₹1K</option>
                <option value="mid">₹1K–₹10K</option>
                <option value="high">Above ₹10K</option>
              </select>

              {/* GST filter */}
              {gstRates.length > 0 && (
                <select value={gstFilter} onChange={e => setGstFilter(e.target.value)} className={`h-8 px-2 rounded-xl text-xs border flex-shrink-0 focus:outline-none ${isDark ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                  <option value="all">All GST</option>
                  {gstRates.map(r => <option key={r} value={String(r)}>GST {r}%</option>)}
                </select>
              )}

              {/* Category filter */}
              {categories.length > 0 && (
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className={`h-8 px-2 rounded-xl text-xs border flex-shrink-0 focus:outline-none ${isDark ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                  <option value="all">All Categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}

              {/* Sort */}
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={`h-8 px-2 rounded-xl text-xs border flex-shrink-0 focus:outline-none ${isDark ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                <option value="name">Sort: Name</option>
                <option value="price_asc">Price ↑</option>
                <option value="price_desc">Price ↓</option>
                <option value="gst">GST Rate</option>
                <option value="category">Category</option>
              </select>

              {/* View toggle */}
              <div className={`flex rounded-xl p-0.5 gap-0.5 flex-shrink-0 ml-auto ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? (isDark ? 'bg-slate-900 shadow text-slate-200' : 'bg-white shadow text-slate-700') : 'text-slate-400'}`} title="Grid view">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? (isDark ? 'bg-slate-900 shadow text-slate-200' : 'bg-white shadow text-slate-700') : 'text-slate-400'}`} title="List view">
                  <Table className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Category quick chips */}
            {categories.length > 0 && (
              <div className={`px-4 py-2 border-b flex gap-1.5 flex-wrap flex-shrink-0 ${isDark ? 'border-slate-700/60' : 'border-slate-100'}`}>
                <button onClick={() => setFilterCat('all')} className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${filterCat === 'all' ? 'bg-blue-600 text-white border-blue-600' : (isDark ? 'border-slate-600 text-slate-400 hover:border-slate-400' : 'border-slate-200 text-slate-500 hover:border-slate-400')}`}>All ({products.length})</button>
                {categories.map(cat => {
                  const cc = getCatColor(products.find(p => p.category === cat)?.color || 'blue');
                  const cnt = products.filter(p => p.category === cat).length;
                  return (
                    <button key={cat} onClick={() => setFilterCat(filterCat === cat ? 'all' : cat)}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${filterCat === cat ? `${cc.dot} text-white border-transparent` : (isDark ? `border-slate-600 text-slate-400 hover:${cc.bg}` : `border-slate-200 ${cc.text} ${cc.bg}`)}`}>
                      {cat} ({cnt})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bulk actions bar */}
            {selectedIds.size > 0 && (
              <div className={`px-4 py-2 border-b flex items-center gap-3 flex-shrink-0 ${isDark ? 'border-slate-700 bg-blue-900/20' : 'border-blue-100 bg-blue-50'}`}>
                <span className="text-xs font-semibold text-blue-600">{selectedIds.size} selected</span>
                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700 underline">Clear</button>
                <button onClick={toggleSelectAll} className="text-xs text-blue-500 hover:text-blue-700 underline">{selectedIds.size === filtered.length ? 'Deselect all' : 'Select all'}</button>
                <div className="ml-auto">
                  {!bulkDeleteConfirm ? (
                    <button onClick={() => setBulkDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-600 hover:bg-red-200 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" /> Delete {selectedIds.size} items
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-medium">Confirm delete {selectedIds.size} items?</span>
                      <button onClick={handleBulkDelete} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">Yes, Delete</button>
                      <button onClick={() => setBulkDeleteConfirm(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors">Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Results count */}
            <div className={`px-4 py-1.5 text-[11px] flex items-center justify-between flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>{filtered.length} of {products.length} items{(search || filterCat !== 'all' || filterType !== 'all' || priceRangeFilter !== 'all' || gstFilter !== 'all') ? ' (filtered)' : ''}</span>
              <div className="flex items-center gap-2">
                {filtered.length !== products.length && <button className="text-blue-500 hover:underline text-[11px]" onClick={() => { setSearch(''); setFilterCat('all'); setFilterType('all'); setPriceRangeFilter('all'); setGstFilter('all'); }}>Clear all filters</button>}
                {filtered.length > 0 && <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600 text-[11px] hover:underline">{selectedIds.size === filtered.length ? 'Deselect all' : 'Select all'}</button>}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400">
                  <Layers className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-semibold">{products.length === 0 ? 'Catalog is empty' : 'No matches found'}</p>
                  <p className="text-xs mt-1">{products.length === 0 ? 'Add your first service or product' : 'Try adjusting your filters'}</p>
                  {products.length === 0 && (
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" onClick={() => setActiveTab('add')} className="h-8 text-xs rounded-xl gap-1.5 text-white" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><Plus className="h-3.5 w-3.5" />Add First Item</Button>
                      <Button size="sm" onClick={handleImport} className="h-8 text-xs rounded-xl gap-1.5" variant="outline"><Download className="h-3.5 w-3.5" />Import from Invoices</Button>
                    </div>
                  )}
                </div>
              ) : viewMode === 'grid' ? (
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filtered.map(p => {
                    const cc = getCatColor(p.color || 'blue');
                    const isSelected = selectedIds.has(p.id);
                    return (
                      <div key={p.id}
                        className={`relative rounded-2xl border cursor-pointer group transition-all ${isSelected ? (isDark ? 'bg-blue-900/30 border-blue-600' : 'bg-blue-50 border-blue-300 shadow-md') : (isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:shadow-md' : 'bg-white border-slate-150 hover:border-blue-200 hover:shadow-md')}`}
                        style={{ boxShadow: isSelected ? `0 0 0 2px ${COLORS.mediumBlue}40` : undefined }}>

                        {/* Select checkbox */}
                        <div className={`absolute top-2.5 left-2.5 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : (isDark ? 'border-slate-500 bg-slate-700' : 'border-slate-300 bg-white')}`}>
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </button>
                        </div>

                        {/* Action buttons */}
                        <div className={`absolute top-2.5 right-2.5 z-10 flex gap-1 transition-opacity ${isSelected ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`} onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleDuplicate(p)} className={`w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`} title="Duplicate"><Copy className="h-3 w-3" /></button>
                          <button onClick={() => handleEdit(p)} className="w-6 h-6 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"><Edit className="h-3 w-3" /></button>
                          <button onClick={() => handleDelete(p.id)} className="w-6 h-6 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 className="h-3 w-3" /></button>
                        </div>

                        <div className="p-4 pt-3" onClick={() => handleEdit(p)}>
                          {/* Type icon + color bar */}
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm ${cc.dot}`}>
                              {p.is_service !== false ? <Briefcase className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{p.is_service !== false ? 'Service' : 'Product'}</p>
                            </div>
                          </div>

                          {/* Name */}
                          <p className={`text-sm font-bold leading-snug mb-1 pr-4 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{p.name}</p>
                          {p.description && <p className="text-[11px] text-slate-400 mb-2 line-clamp-2">{p.description}</p>}

                          {/* Price */}
                          <div className="flex items-baseline gap-1 mb-2">
                            <span className={`text-base font-extrabold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>₹{(p.unit_price || 0).toLocaleString('en-IN')}</span>
                            <span className="text-[11px] text-slate-400">/ {p.unit || 'service'}</span>
                          </div>

                          {/* Tags row */}
                          <div className="flex flex-wrap gap-1">
                            {p.category && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${cc.bg} ${cc.text}`}>{p.category}</span>}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>GST {p.gst_rate}%</span>
                            {p.discount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-600">{p.discount}% off</span>}
                            {p.hsn_sac && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>{p.hsn_sac}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // List view
                <table className="w-full text-sm">
                  <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                    <tr>
                      <th className="w-8 pl-4 py-2.5 text-left">
                        <button onClick={toggleSelectAll} className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedIds.size === filtered.length && filtered.length > 0 ? 'bg-blue-600 border-blue-600' : (isDark ? 'border-slate-500' : 'border-slate-300')}`}>
                          {selectedIds.size === filtered.length && filtered.length > 0 && <Check className="h-2.5 w-2.5 text-white" />}
                        </button>
                      </th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">Name</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">Type</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">Category</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">Price</th>
                      <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide">GST</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">HSN/SAC</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => {
                      const cc = getCatColor(p.color || 'blue');
                      const isSelected = selectedIds.has(p.id);
                      return (
                        <tr key={p.id} className={`border-b group transition-colors cursor-pointer ${isSelected ? (isDark ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-100') : (isDark ? 'border-slate-700/60 hover:bg-slate-800/60' : 'border-slate-100 hover:bg-slate-50')}`}>
                          <td className="pl-4 py-2.5 w-8">
                            <button onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }} className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : (isDark ? 'border-slate-500' : 'border-slate-300')}`}>
                              {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                            </button>
                          </td>
                          <td className="px-3 py-2.5" onClick={() => handleEdit(p)}>
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${cc.dot}`}>
                                {p.is_service !== false ? <Briefcase className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                              </div>
                              <div>
                                <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{p.name}</p>
                                {p.description && <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{p.description}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${p.is_service !== false ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {p.is_service !== false ? 'Service' : 'Product'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {p.category && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${cc.bg} ${cc.text}`}>{p.category}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`text-sm font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>₹{(p.unit_price || 0).toLocaleString('en-IN')}</span>
                            {p.discount > 0 && <span className="ml-1 text-[10px] text-orange-500">{p.discount}% off</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[11px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{p.gst_rate}%</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[11px] text-slate-400 font-mono">{p.hsn_sac || '—'}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                              <button onClick={() => handleDuplicate(p)} className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}><Copy className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleEdit(p)} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"><Edit className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleDelete(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            {products.length > 0 && (
              <div className={`px-4 py-2 border-t text-[11px] flex justify-between items-center flex-shrink-0 ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                <span>{analytics.services} services · {analytics.goods} products</span>
                <span>Click a row to edit · Items appear as suggestions in new invoices</span>
              </div>
            )}
          </div>
        )}

        {/* ── ADD / EDIT TAB ── */}
        {activeTab === 'add' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              {editing && (
                <div className={`mb-4 px-4 py-3 rounded-xl border flex items-center justify-between ${isDark ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-200'}`}>
                  <span className="text-xs font-semibold text-blue-600">Editing: <span className="font-bold">{editing.name}</span></span>
                  <button onClick={() => { setEditing(null); setForm(emptyForm); }} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><X className="h-3 w-3" /> Cancel edit</button>
                </div>
              )}

              {/* Type toggle */}
              <div className={`flex rounded-xl p-1 gap-1 mb-5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <button onClick={() => setForm(p => ({ ...p, is_service: true }))} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${form.is_service ? 'bg-white text-slate-800 shadow' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500')}`}>
                  <Briefcase className="h-4 w-4" /> Service
                </button>
                <button onClick={() => setForm(p => ({ ...p, is_service: false }))} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${!form.is_service ? 'bg-white text-slate-800 shadow' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500')}`}>
                  <Package className="h-4 w-4" /> Product
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Name *</label>
                  <input className={inputCls} placeholder="e.g. GST Filing, Website Design" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Description</label>
                  <input className={inputCls} placeholder="Short description of the service" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Unit Price (₹)</label>
                  <input type="number" className={inputCls} value={form.unit_price} onChange={e => setForm(p => ({ ...p, unit_price: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className={labelCls}>GST %</label>
                  <select className={inputCls} value={form.gst_rate} onChange={e => setForm(p => ({ ...p, gst_rate: parseFloat(e.target.value) }))}>
                    {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>HSN / SAC Code</label>
                  <input className={inputCls} placeholder="998311" value={form.hsn_sac} onChange={e => setForm(p => ({ ...p, hsn_sac: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Unit</label>
                  <select className={inputCls} value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                    {['service', 'hour', 'day', 'month', 'year', 'piece', 'kg', 'litre', 'nos'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Category</label>
                  <input className={inputCls} placeholder="e.g. GST, Legal, Design" value={form.category} list="cat-list" onChange={e => setForm(p => ({ ...p, category: e.target.value }))} />
                  <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className={labelCls}>Discount %</label>
                  <input type="number" className={inputCls} min="0" max="100" value={form.discount} onChange={e => setForm(p => ({ ...p, discount: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Color Tag</label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {['blue', 'green', 'purple', 'orange', 'red', 'teal'].map(c => {
                      const cc = getCatColor(c);
                      return (
                        <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                          className={`w-7 h-7 rounded-full transition-all ${cc.dot} ${form.color === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'}`} />
                      );
                    })}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Internal Notes</label>
                  <textarea className={`${inputCls} h-16 py-2 resize-none`} placeholder="Private notes about this item…" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button onClick={handleSave} disabled={loading} className="flex-1 h-10 rounded-xl gap-2 text-white font-semibold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                  {loading ? 'Saving…' : (editing ? '✓ Update Item' : '+ Add to Catalog')}
                </Button>
                <Button variant="outline" onClick={() => { setEditing(null); setForm(emptyForm); setActiveTab('catalog'); }} className="h-10 px-4 rounded-xl">Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Items', value: analytics.totalProducts, icon: Package, color: 'blue' },
                { label: 'Services', value: analytics.services, icon: Briefcase, color: 'purple' },
                { label: 'Products', value: analytics.goods, icon: Tag, color: 'green' },
                { label: 'Avg Price', value: `₹${analytics.avgPrice.toLocaleString('en-IN')}`, icon: IndianRupee, color: 'amber' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className={`rounded-xl p-4 border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'} shadow-sm`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color === 'blue' ? 'bg-blue-100 text-blue-600' : color === 'purple' ? 'bg-purple-100 text-purple-600' : color === 'green' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}><Icon className="h-4 w-4" /></div>
                  <p className={`text-xl font-extrabold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{value}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Top services */}
              <div className={`rounded-xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'} shadow-sm`}>
                <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  <TrendingUp className="h-4 w-4 text-blue-500" /> Most Used in Invoices
                </h3>
                {analytics.topServices.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No invoice data yet</p>
                ) : analytics.topServices.map(([name, count], i) => {
                  const pct = Math.round((count / analytics.topServices[0][1]) * 100);
                  return (
                    <div key={name} className="mb-3 last:mb-0">
                      <div className="flex justify-between mb-1">
                        <span className={`text-xs font-medium truncate max-w-[70%] ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          <span className="text-slate-400 mr-1">#{i + 1}</span>{name}
                        </span>
                        <span className="text-xs text-slate-400">{count}x</span>
                      </div>
                      <div className={`h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Categories */}
              <div className={`rounded-xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'} shadow-sm`}>
                <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  <Tag className="h-4 w-4 text-purple-500" /> By Category
                </h3>
                {analytics.byCategory.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No categories set yet</p>
                ) : (
                  <div className="space-y-2.5">
                    {analytics.byCategory.map(({ cat, count }) => {
                      const cc = getCatColor(products.find(p => p.category === cat)?.color || 'blue');
                      const pct = Math.round((count / products.length) * 100);
                      return (
                        <div key={cat}>
                          <div className="flex justify-between mb-1">
                            <span className={`text-xs font-semibold ${cc.text}`}>{cat}</span>
                            <span className="text-xs text-slate-400">{count} items · {pct}%</span>
                          </div>
                          <div className={`h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                            <div className={`h-1.5 rounded-full transition-all ${cc.dot}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* GST breakdown */}
              <div className={`rounded-xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'} shadow-sm sm:col-span-2`}>
                <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" /> GST Rate Distribution
                </h3>
                <div className="flex flex-wrap gap-3">
                  {gstRates.map(rate => {
                    const count = products.filter(p => p.gst_rate === rate).length;
                    const pct = Math.round((count / products.length) * 100);
                    return (
                      <div key={rate} className={`flex-1 min-w-[100px] rounded-xl p-3 text-center ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
                        <p className={`text-lg font-extrabold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{rate}%</p>
                        <p className="text-xs text-slate-400">{count} items · {pct}%</p>
                      </div>
                    );
                  })}
                  {gstRates.length === 0 && <p className="text-xs text-slate-400">No items yet</p>}
                </div>
              </div>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
};
