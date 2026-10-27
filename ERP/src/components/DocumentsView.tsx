import { useEffect, useRef, useState } from "react";
import { Upload, Download } from "lucide-react";
import { api } from "../api";
import type { DocumentMeta } from "../types";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

const OWNER_TYPES = ["party", "policy", "claim", "complaint", "insurer"];

export default function DocumentsView() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [ownerEntityType, setOwnerEntityType] = useState("party");
  const [ownerEntityId, setOwnerEntityId] = useState("");
  const [documentType, setDocumentType] = useState("kyc");
  const [sensitivity, setSensitivity] = useState("internal");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    api.documents.list().then(setDocuments).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !ownerEntityId) return;
    setSaving(true);
    try {
      const fileBase64 = await fileToBase64(file);
      await api.documents.upload({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileBase64,
        ownerEntityType,
        ownerEntityId,
        documentType,
        sensitivity,
      });
      setFile(null);
      setOwnerEntityId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(doc: DocumentMeta) {
    try {
      const blob = await api.documents.download(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const filtered = documents.filter((d) => matchesQuery(query, d.fileName, d.documentType, d.ownerEntityType, d.ownerEntityId, d.sensitivity));
  const { pageItems, totalPages, clampedPage } = usePagedSlice(filtered, page);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Upload size={15} /> Upload
        </button>
      </div>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <SearchInput value={query} onChange={setQuery} placeholder="Search by file name, type, linked entity…" />

      {showForm && (
        <form onSubmit={handleUpload} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={ownerEntityType} onChange={(e) => setOwnerEntityType(e.target.value)}>
            {OWNER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input required placeholder="Entity ID (e.g. party-123)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={ownerEntityId} onChange={(e) => setOwnerEntityId(e.target.value)} />
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            <option value="kyc">KYC</option>
            <option value="policy_wording">Policy wording</option>
            <option value="claim_evidence">Claim evidence</option>
            <option value="correspondence">Correspondence</option>
            <option value="regulatory">Regulatory</option>
            <option value="other">Other</option>
          </select>
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
            <option value="internal">Internal</option>
            <option value="restricted">Restricted</option>
            <option value="public">Public</option>
          </select>
          <input required ref={fileInputRef} type="file" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-1" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button disabled={saving || !file} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Uploading…" : "Upload"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5 font-medium">File</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Linked to</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Sensitivity</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Uploaded</th>
              <th scope="col" className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{documents.length === 0 ? "No documents uploaded yet." : `No documents match "${query}".`}</td></tr>
            ) : (
              pageItems.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{d.fileName}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-600">{d.documentType?.replace("_", " ") || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{d.ownerEntityType} · {d.ownerEntityId}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-600">{d.sensitivity}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => handleDownload(d)} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Download size={13} /> Download
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={clampedPage} totalPages={totalPages} totalItems={filtered.length} onChange={setPage} />
      </div>
    </div>
  );
}
