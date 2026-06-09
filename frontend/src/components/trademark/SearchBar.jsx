import React, { useState, useRef, useEffect } from "react";
import { MagnifyingGlass, ArrowRight, Image as ImageIcon, X } from "@phosphor-icons/react";

const MAX_LOGO_BYTES = 350_000;

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const SearchBar = ({ onSubmit, loading, defaultValue = "", defaultClass = "" }) => {
  const [name, setName] = useState(defaultValue);
  const [klass, setKlass] = useState(defaultClass);
  const [deviceOnly, setDeviceOnly] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [logoFileName, setLogoFileName] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    if (defaultClass !== "" && defaultClass !== undefined) setKlass(String(defaultClass));
  }, [defaultClass]);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) return alert("Please upload an image file");
    if (f.size > MAX_LOGO_BYTES) return alert("Logo must be under 350 KB");
    const dataUrl = await fileToDataUrl(f);
    setLogoDataUrl(dataUrl);
    setLogoFileName(f.name);
    setDeviceOnly(true);
  };

  const clearLogo = () => {
    setLogoDataUrl(null);
    setLogoFileName(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || loading) return;
    onSubmit(name.trim(), {
      class_filter: klass ? Number(klass) : null,
      device_only: deviceOnly,
      logo_data_url: logoDataUrl,
    });
  };

  return (
    <section
      data-testid="search-form"
      className="ts-card overflow-hidden"
    >
      <form onSubmit={submit}>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-0">
          <div className="relative">
            <MagnifyingGlass
              size={18}
              weight="bold"
              className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              data-testid="search-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a brand name e.g. Kunjveda"
              className="w-full h-16 pl-12 pr-4 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none border-b md:border-b-0 md:border-r border-slate-200"
              autoFocus
            />
          </div>
          <div className="border-b md:border-b-0 md:border-r border-slate-200">
            <select
              data-testid="class-select"
              value={klass}
              onChange={(e) => setKlass(e.target.value)}
              className="w-full h-16 px-4 bg-transparent text-sm text-slate-700 focus:outline-none appearance-none"
            >
              <option value="">All classes</option>
              {Array.from({ length: 45 }, (_, i) => i + 1).map((c) => (
                <option key={c} value={c}>Class {c}</option>
              ))}
            </select>
          </div>
          <button
            data-testid="search-submit"
            type="submit"
            disabled={loading || !name.trim()}
            className="h-16 px-8 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {loading ? "Analysing…" : "Run Report"}
            <ArrowRight size={16} weight="bold" />
          </button>
        </div>

        {/* Advanced row */}
        <div className="border-t border-slate-200 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-0">
          <label
            data-testid="device-only-toggle"
            className="flex items-center gap-3 px-5 py-3.5 border-b md:border-b-0 md:border-r border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
          >
            <input
              type="checkbox"
              checked={deviceOnly}
              onChange={(e) => setDeviceOnly(e.target.checked)}
              className="w-4 h-4 accent-blue-600 rounded"
            />
            <span className="text-sm text-slate-700">Device / logo marks only</span>
          </label>
          <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
            <button
              type="button"
              data-testid="logo-upload-btn"
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ImageIcon size={14} weight="bold" className="text-slate-500" />
              {logoDataUrl ? "Replace logo" : "Upload logo (optional)"}
            </button>
            <input
              ref={fileInput}
              data-testid="logo-input"
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            {logoDataUrl && (
              <div className="flex items-center gap-2" data-testid="logo-preview">
                <img
                  src={logoDataUrl}
                  alt="logo preview"
                  className="h-8 w-8 object-contain rounded-lg border border-slate-200 bg-white"
                />
                <span className="text-xs text-slate-600 truncate max-w-[180px]">{logoFileName}</span>
                <button
                  type="button"
                  data-testid="logo-clear"
                  onClick={clearLogo}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-600 hover:bg-red-50"
                >
                  <X size={10} weight="bold" /> Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </form>
    </section>
  );
};

export default SearchBar;
