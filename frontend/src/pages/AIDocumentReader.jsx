import React, { useState, useRef } from "react";
import { Upload, FileText, Loader2, Sparkles, X } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const ACCEPTED = ".pdf,.xlsx,.xls,.xlsm,.csv,.jpg,.jpeg,.png,.webp";

const FILE_ICONS = {
  pdf: "📄", xlsx: "📊", xls: "📊", xlsm: "📊",
  csv: "📋", jpg: "🖼️", jpeg: "🖼️", png: "🖼️", webp: "🖼️",
};

export default function AIDocumentReader() {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const inputRef                = useRef(null);

  const ext = file?.name?.rsplit?.(".", 1)?.[1]?.toLowerCase()
    ?? file?.name?.split(".").pop()?.toLowerCase();

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setResult(null);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/ai/analyze-document", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      setResult(data.analysis);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const fileExt = file?.name?.split(".").pop()?.toLowerCase() ?? "";
  const fileIcon = FILE_ICONS[fileExt] ?? "📁";

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-blue-500" />
        <div>
          <h1 className="text-xl font-semibold">AI Document Reader</h1>
          <p className="text-sm text-muted-foreground">
            Upload any PDF, Excel, invoice, image, or report — get instant AI analysis
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">Drop your file here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF · Excel (xlsx/xls) · CSV · JPG · PNG · Invoice images
        </p>
      </div>

      {/* Selected file card */}
      {file && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{fileIcon}</span>
                <div>
                  <p className="text-sm font-medium truncate max-w-xs">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button onClick={clear} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {preview && (
              <img src={preview} alt="preview" className="mt-3 max-h-40 rounded-md object-contain" />
            )}

            <Button onClick={analyze} disabled={loading} className="mt-4 w-full gap-2">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Analyse with AI</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" /> AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
              {result}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
