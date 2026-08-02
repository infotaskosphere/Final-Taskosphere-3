// ─── Lazy loaders for heavy export libraries ───────────────────────────────
// xlsx (~420KB), jspdf (~360KB), jspdf-autotable, and html2canvas (~200KB)
// are only needed when a user actually clicks an "Export to Excel/PDF"
// button. Importing them statically at the top of a page file forces every
// visitor to download and parse them just to open that page. These helpers
// dynamically `import()` the library on first use and cache the module so
// repeat exports on the same page don't re-fetch it.
let _xlsx, _jsPDF, _autoTable, _html2canvas;

export const getXLSX = async () => (_xlsx ??= await import('xlsx'));
export const getJsPDF = async () => (_jsPDF ??= (await import('jspdf')).default);
export const getAutoTable = async () => (_autoTable ??= (await import('jspdf-autotable')).default);
export const getHtml2Canvas = async () => (_html2canvas ??= (await import('html2canvas')).default);
