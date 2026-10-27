import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { api } from "../api";
import type { Party, Policy, Opportunity, Claim, Complaint, DocumentMeta, Relationship, Interaction, ClientAccount, CorrespondenceTemplate, Notification, AuditLogEntry, Endorsement, Renewal, KycChecklistItem } from "../types";
import { RELATIONSHIP_TYPES, INTERACTION_CHANNELS, CLIENT_SEGMENTS, KYC_STATUSES, KYC_DOCUMENT_LABEL } from "../types";
import StatusPill from "./StatusPill";

type Tab = "overview" | "kyc" | "policies" | "opportunities" | "claims" | "complaints" | "contacts" | "communications" | "documents" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "kyc", label: "KYC" },
  { id: "policies", label: "Policies" },
  { id: "opportunities", label: "Opportunities" },
  { id: "claims", label: "Claims" },
  { id: "complaints", label: "Complaints" },
  { id: "contacts", label: "Contacts" },
  { id: "communications", label: "Communications" },
  { id: "documents", label: "Documents" },
  { id: "history", label: "History" },
];

const EMPTY_RELATIONSHIP_FORM = { relatedPartyId: "", relationshipType: "director", ownershipPct: "", pepStatus: false, designation: "" };
const EMPTY_INTERACTION_FORM = { channel: "call", direction: "outbound" as "inbound" | "outbound", subject: "", notes: "" };
const EMPTY_ACCOUNT_FORM = { segment: "retail", branch: "", serviceTier: "", kycStatus: "pending" };
const EMPTY_NOTIFICATION_FORM = { templateCode: "" };

export default function PartyProfileView({ partyId, onBack }: { partyId: string; onBack: () => void }) {
  const [party, setParty] = useState<Party | null>(null);
  const [allParties, setAllParties] = useState<Party[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [account, setAccount] = useState<ClientAccount | null>(null);
  const [templates, setTemplates] = useState<CorrespondenceTemplate[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [kycItems, setKycItems] = useState<KycChecklistItem[]>([]);
  const [showKycForm, setShowKycForm] = useState(false);
  const [kycDocumentType, setKycDocumentType] = useState("");
  const [uploadingKycId, setUploadingKycId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRelationshipForm, setShowRelationshipForm] = useState(false);
  const [relationshipForm, setRelationshipForm] = useState(EMPTY_RELATIONSHIP_FORM);
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [interactionForm, setInteractionForm] = useState(EMPTY_INTERACTION_FORM);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM);
  const [showNotificationForm, setShowNotificationForm] = useState(false);
  const [notificationForm, setNotificationForm] = useState(EMPTY_NOTIFICATION_FORM);

  function load() {
    setLoading(true);
    Promise.all([
      api.parties.list(),
      api.policies.list(),
      api.opportunities.list(),
      api.claims.list(),
      api.complaints.list(),
      api.documents.list("party", partyId),
      api.relationships.list(partyId),
      api.interactions.list(partyId),
      api.clientAccounts.list(partyId),
      api.correspondenceTemplates.list(),
      api.notifications.list(partyId),
      api.auditLog.list().catch(() => [] as AuditLogEntry[]), // needs audit.view; history is simply empty without it
      api.endorsements.list(),
      api.renewals.list(),
      api.kycChecklistItems.list(partyId),
    ])
      .then(([parties, allPolicies, allOpportunities, allClaims, allComplaints, docs, rels, ints, accounts, tmpls, notifs, log, allEndorsements, allRenewals, kyc]) => {
        setParty(parties.find((p) => p.id === partyId) || null);
        setAllParties(parties);
        const myPolicies = allPolicies.filter((p) => p.clientId === partyId);
        setPolicies(myPolicies);
        setOpportunities(allOpportunities.filter((o) => o.partyId === partyId));
        const myPolicyIds = new Set(myPolicies.map((p) => p.id));
        setClaims(allClaims.filter((c) => myPolicyIds.has(c.policyId || "")));
        setComplaints(allComplaints.filter((c) => c.partyId === partyId));
        setDocuments(docs);
        setRelationships(rels);
        setInteractions(ints);
        const existingAccount = accounts[0] || null;
        setAccount(existingAccount);
        if (existingAccount) {
          setAccountForm({
            segment: existingAccount.segment || "retail",
            branch: existingAccount.branch || "",
            serviceTier: existingAccount.serviceTier || "",
            kycStatus: existingAccount.kycStatus,
          });
        }
        setTemplates(tmpls.filter((t) => t.active));
        setNotifications(notifs);
        setAuditLog(log);
        setEndorsements(allEndorsements.filter((e) => myPolicyIds.has(e.policyId)));
        setRenewals(allRenewals.filter((r) => myPolicyIds.has(r.policyId)));
        setKycItems(kyc);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [partyId]);

  async function handleCreateRelationship(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.relationships.create({
        partyId,
        relatedPartyId: relationshipForm.relatedPartyId || undefined,
        relationshipType: relationshipForm.relationshipType,
        ownershipPct: relationshipForm.ownershipPct ? Number(relationshipForm.ownershipPct) : undefined,
        pepStatus: relationshipForm.pepStatus,
        designation: relationshipForm.designation || undefined,
      });
      setRelationshipForm(EMPTY_RELATIONSHIP_FORM);
      setShowRelationshipForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogInteraction(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.interactions.create({
        partyId,
        channel: interactionForm.channel,
        direction: interactionForm.direction,
        subject: interactionForm.subject || undefined,
        notes: interactionForm.notes || undefined,
      });
      setInteractionForm(EMPTY_INTERACTION_FORM);
      setShowInteractionForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (account) {
        await api.clientAccounts.update(account.id, accountForm);
      } else {
        await api.clientAccounts.create({ partyId, ...accountForm });
      }
      setShowAccountForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddKycItem(e: React.FormEvent) {
    e.preventDefault();
    if (!kycDocumentType.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.kycChecklistItems.create({ partyId, documentType: kycDocumentType.trim() });
      setKycItems((prev) => [...prev, created]);
      setKycDocumentType("");
      setShowKycForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleKycStatus(item: KycChecklistItem, status: KycChecklistItem["status"]) {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.kycChecklistItems.update(item.id, { status });
      setKycItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function kycFileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  async function handleKycUpload(item: KycChecklistItem, file: File) {
    setUploadingKycId(item.id);
    setError(null);
    try {
      const fileBase64 = await kycFileToBase64(file);
      const doc = await api.documents.upload({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileBase64,
        ownerEntityType: "party",
        ownerEntityId: partyId,
        documentType: "kyc",
        sensitivity: "confidential",
      });
      const updated = await api.kycChecklistItems.update(item.id, { status: "received", documentId: doc.id });
      setKycItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      setDocuments((prev) => [doc, ...prev]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingKycId(null);
    }
  }

  async function handleSendNotification(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.notifications.create({ partyId, templateCode: notificationForm.templateCode });
      setNotificationForm(EMPTY_NOTIFICATION_FORM);
      setShowNotificationForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkSent(notificationId: string) {
    setSaving(true);
    try {
      await api.notifications.update(notificationId, { status: "sent" });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading client profile…</p>;
  if (error && !party) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  if (!party) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Party not found.</div>;

  const activePolicies = policies.filter((p) => p.status === "Active").length;
  const openOpportunities = opportunities.filter((o) => !["Won", "Lost", "Deferred"].includes(o.stage)).length;
  const openClaims = claims.filter((c) => c.status !== "Closed").length;

  // Correlates the audit log across every entity type tied to this
  // party — not just PARTY_UPDATED events on the party's own row — so
  // History reads as one client record's timeline, per the wireframe's
  // design principle, rather than requiring staff to check each tab's
  // own history separately.
  const relevantEntityIds: Record<string, Set<string>> = {
    party: new Set([partyId]),
    policy: new Set(policies.map((p) => p.id)),
    opportunity: new Set(opportunities.map((o) => o.id)),
    claim: new Set(claims.map((c) => c.id)),
    complaint: new Set(complaints.map((c) => c.id)),
    endorsement: new Set(endorsements.map((e) => e.id)),
    renewal: new Set(renewals.map((r) => r.id)),
  };
  const historyEvents = auditLog
    .filter((entry) => relevantEntityIds[entry.entityType]?.has(entry.entityId))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft size={15} /> Back to Parties
      </button>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{party.fullName}</h2>
            <p className="mt-0.5 text-sm capitalize text-slate-500">{party.partyType} {party.county ? `· ${party.county}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={party.status} />
            {party.riskRating && <StatusPill status={`${party.riskRating} risk`} tone={party.riskRating === "high" ? "critical" : party.riskRating === "medium" ? "warning" : "good"} />}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Phone</p><p className="text-slate-700">{party.phoneNumber || "—"}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Email</p><p className="text-slate-700">{party.email || "—"}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">National ID / Reg No.</p><p className="text-slate-700">{party.nationalId || "—"}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">KRA PIN</p><p className="text-slate-700">{party.kraPin || "—"}</p></div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
          <div className="rounded-md bg-slate-50 p-3 text-center">
            <p className="text-lg font-semibold tabular-nums text-emerald-600">{activePolicies}</p>
            <p className="text-xs text-slate-500">Active policies</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3 text-center">
            <p className="text-lg font-semibold tabular-nums text-slate-900">{openOpportunities}</p>
            <p className="text-xs text-slate-500">Open opportunities</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3 text-center">
            <p className={`text-lg font-semibold tabular-nums ${openClaims > 0 ? "text-amber-600" : "text-slate-900"}`}>{openClaims}</p>
            <p className="text-xs text-slate-500">Open claims</p>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-1 py-2 text-sm font-medium ${tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SummaryList title="Recent policies" empty="No policies yet.">
            {policies.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-slate-700">{p.id} · {p.category}</span>
                <StatusPill status={p.status} />
              </li>
            ))}
          </SummaryList>
          <SummaryList title="Recent claims" empty="No claims yet.">
            {claims.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{c.claimType}</span>
                <StatusPill status={c.status} />
              </li>
            ))}
          </SummaryList>

          <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Client account</p>
              <button onClick={() => setShowAccountForm((v) => !v)} className="text-xs font-medium text-indigo-600 hover:underline">
                {account ? "Edit" : "Set up account"}
              </button>
            </div>

            {showAccountForm ? (
              <form onSubmit={handleSaveAccount} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={accountForm.segment} onChange={(e) => setAccountForm({ ...accountForm, segment: e.target.value })}>
                  {CLIENT_SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input placeholder="Branch" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={accountForm.branch} onChange={(e) => setAccountForm({ ...accountForm, branch: e.target.value })} />
                <input placeholder="Service tier" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={accountForm.serviceTier} onChange={(e) => setAccountForm({ ...accountForm, serviceTier: e.target.value })} />
                <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={accountForm.kycStatus} onChange={(e) => setAccountForm({ ...accountForm, kycStatus: e.target.value })}>
                  {KYC_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
                <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
              </form>
            ) : account ? (
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Segment</p><p className="capitalize text-slate-700">{account.segment || "—"}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Branch</p><p className="text-slate-700">{account.branch || "—"}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Service tier</p><p className="text-slate-700">{account.serviceTier || "—"}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">KYC status</p><StatusPill status={account.kycStatus} tone={account.kycStatus === "approved" ? "good" : ["rejected", "restricted"].includes(account.kycStatus) ? "critical" : "warning"} /></div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No client account set up yet — segment, branch, service tier and KYC status live here, separate from this party's own status.</p>
            )}
          </div>
        </div>
      )}

      {tab === "kyc" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Requisite onboarding documents for a {party.partyType} client — auto-created when the party was registered. Upload the file for an item to mark it received, then verify or waive it before KYC can be approved.
            </p>
            <button onClick={() => setShowKycForm((v) => !v)} className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <Plus size={13} /> Add requirement
            </button>
          </div>

          {showKycForm && (
            <form onSubmit={handleAddKycItem} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
              <input required placeholder="Document type (e.g. proof_of_address)" className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={kycDocumentType} onChange={(e) => setKycDocumentType(e.target.value)} />
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Add</button>
            </form>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Document</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">File</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {kycItems.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No KYC checklist items.</td></tr>
                ) : (
                  kycItems.map((item) => {
                    const linkedDoc = item.documentId ? documents.find((d) => d.id === item.documentId) : null;
                    return (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 text-slate-700">{KYC_DOCUMENT_LABEL[item.documentType] || item.documentType}</td>
                        <td className="px-4 py-2.5">
                          <StatusPill status={item.status} tone={item.status === "verified" || item.status === "waived" ? "good" : item.status === "received" ? "warning" : "neutral"} />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{linkedDoc ? linkedDoc.fileName : "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <label className="cursor-pointer text-xs font-medium text-indigo-600 hover:underline">
                              {uploadingKycId === item.id ? "Uploading…" : item.documentId ? "Replace file" : "Upload"}
                              <input
                                type="file"
                                className="hidden"
                                disabled={uploadingKycId === item.id}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleKycUpload(item, f); e.target.value = ""; }}
                              />
                            </label>
                            {item.status === "received" && (
                              <button onClick={() => handleKycStatus(item, "verified")} disabled={saving} className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50">Verify</button>
                            )}
                            {item.status !== "verified" && item.status !== "waived" && (
                              <button onClick={() => handleKycStatus(item, "waived")} disabled={saving} className="text-xs font-medium text-slate-500 hover:underline disabled:opacity-50">Waive</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "policies" && (
        <SimpleTable
          headers={["Policy", "Category", "Premium", "Cover period", "Status"]}
          rows={policies.map((p) => [
            <span className="font-mono text-xs">{p.id}</span>,
            <span className="capitalize">{p.category}</span>,
            `KES ${Number(p.premiumAmount).toLocaleString()}`,
            `${p.startDate} → ${p.endDate}`,
            <StatusPill status={p.status} />,
          ])}
          empty="No policies for this client yet."
        />
      )}

      {tab === "opportunities" && (
        <SimpleTable
          headers={["Class", "Source", "Expected premium", "Stage"]}
          rows={opportunities.map((o) => [
            o.class || "—",
            o.source || "—",
            o.expectedPremiumKes ? `KES ${o.expectedPremiumKes.toLocaleString()}` : "—",
            <StatusPill status={o.stage} />,
          ])}
          empty="No opportunities for this client yet."
        />
      )}

      {tab === "claims" && (
        <SimpleTable
          headers={["Claim", "Policy", "Type", "Status"]}
          rows={claims.map((c) => [
            <span className="font-mono text-xs">{c.id}</span>,
            <span className="font-mono text-xs">{c.policyNumber}</span>,
            c.claimType,
            <StatusPill status={c.status} />,
          ])}
          empty="No claims for this client yet."
        />
      )}

      {tab === "complaints" && (
        <SimpleTable
          headers={["Subject", "Severity", "Channel", "Status"]}
          rows={complaints.map((c) => [
            c.subject || "—",
            <span className="capitalize">{c.severity || "—"}</span>,
            <span className="capitalize">{c.channel || "—"}</span>,
            <StatusPill status={c.status} />,
          ])}
          empty="No complaints for this client."
        />
      )}

      {tab === "contacts" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowRelationshipForm((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus size={15} /> Add contact
            </button>
          </div>
          {showRelationshipForm && (
            <form onSubmit={handleCreateRelationship} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={relationshipForm.relationshipType} onChange={(e) => setRelationshipForm({ ...relationshipForm, relationshipType: e.target.value })}>
                {RELATIONSHIP_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={relationshipForm.relatedPartyId} onChange={(e) => setRelationshipForm({ ...relationshipForm, relatedPartyId: e.target.value })}>
                <option value="">-- Not an existing party --</option>
                {allParties.filter((p) => p.id !== partyId).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
              <input placeholder="Designation (e.g. Managing Director)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={relationshipForm.designation} onChange={(e) => setRelationshipForm({ ...relationshipForm, designation: e.target.value })} />
              <input placeholder="Ownership %" type="number" step="0.01" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={relationshipForm.ownershipPct} onChange={(e) => setRelationshipForm({ ...relationshipForm, ownershipPct: e.target.value })} />
              <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600">
                <input type="checkbox" checked={relationshipForm.pepStatus} onChange={(e) => setRelationshipForm({ ...relationshipForm, pepStatus: e.target.checked })} />
                Politically exposed person
              </label>
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving…" : "Add contact"}
              </button>
            </form>
          )}
          <SimpleTable
            headers={["Name", "Relationship", "Ownership", "PEP"]}
            rows={relationships.map((r) => [
              r.relatedPartyId ? (allParties.find((p) => p.id === r.relatedPartyId)?.fullName || r.relatedPartyId) : (r.designation || "—"),
              <span className="capitalize">{r.relationshipType.replace(/_/g, " ")}</span>,
              r.ownershipPct != null ? `${r.ownershipPct}%` : "—",
              r.pepStatus ? <StatusPill status="PEP" tone="warning" /> : "—",
            ])}
            empty="No contacts recorded for this client — directors, beneficial owners, authorized signatories and dependants all live here."
          />
        </div>
      )}

      {tab === "communications" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowInteractionForm((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus size={15} /> Log interaction
            </button>
          </div>
          {showInteractionForm && (
            <form onSubmit={handleLogInteraction} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={interactionForm.channel} onChange={(e) => setInteractionForm({ ...interactionForm, channel: e.target.value })}>
                {INTERACTION_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={interactionForm.direction} onChange={(e) => setInteractionForm({ ...interactionForm, direction: e.target.value as "inbound" | "outbound" })}>
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
              <input placeholder="Subject" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2" value={interactionForm.subject} onChange={(e) => setInteractionForm({ ...interactionForm, subject: e.target.value })} />
              <textarea placeholder="Notes" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-4" value={interactionForm.notes} onChange={(e) => setInteractionForm({ ...interactionForm, notes: e.target.value })} />
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving…" : "Log interaction"}
              </button>
            </form>
          )}
          <SimpleTable
            headers={["Date", "Channel", "Direction", "Subject", "Notes"]}
            rows={interactions.map((i) => [
              new Date(i.occurredAt).toLocaleString(),
              <span className="capitalize">{i.channel}</span>,
              <span className="capitalize">{i.direction}</span>,
              i.subject || "—",
              i.notes || "—",
            ])}
            empty="No calls, emails or visits logged for this client yet."
          />

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-900">System notifications</p>
            <button onClick={() => setShowNotificationForm((v) => !v)} disabled={templates.length === 0} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
              <Plus size={15} /> Send notification
            </button>
          </div>
          {templates.length === 0 && <p className="text-xs text-slate-400">No active correspondence templates yet — add one under Correspondence.</p>}
          {showNotificationForm && (
            <form onSubmit={handleSendNotification} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
              <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={notificationForm.templateCode} onChange={(e) => setNotificationForm({ templateCode: e.target.value })}>
                <option value="">-- Template --</option>
                {templates.map((t) => <option key={t.id} value={t.code}>{t.code} ({t.channel})</option>)}
              </select>
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Queuing…" : "Queue notification"}
              </button>
            </form>
          )}
          <SimpleTable
            headers={["Date", "Channel", "Template", "Status", ""]}
            rows={notifications.map((n) => [
              new Date(n.createdAt).toLocaleString(),
              <span className="capitalize">{n.channel}</span>,
              n.templateCode || "—",
              <StatusPill status={n.status} tone={n.status === "sent" || n.status === "delivered" ? "good" : n.status === "failed" ? "critical" : "neutral"} />,
              n.status === "queued" ? <button onClick={() => handleMarkSent(n.id)} className="text-xs font-medium text-indigo-600 hover:underline">Mark as sent</button> : "",
            ])}
            empty="No system notifications sent to this client yet."
          />
        </div>
      )}

      {tab === "documents" && (
        <SimpleTable
          headers={["File", "Type", "Sensitivity", "Uploaded"]}
          rows={documents.map((d) => [
            d.fileName,
            d.documentType || "—",
            d.sensitivity,
            new Date(d.createdAt).toLocaleDateString(),
          ])}
          empty="No documents on file for this client — upload one under Documents, linked to this party's ID."
        />
      )}

      {tab === "history" && (
        <SimpleTable
          headers={["Date", "Action", "Entity", "Actor"]}
          rows={historyEvents.map((h) => [
            new Date(h.occurredAt).toLocaleString(),
            h.action.replace(/_/g, " "),
            <span className="font-mono text-xs">{h.entityType}:{h.entityId}</span>,
            h.actorStaffId || "—",
          ])}
          empty="No recorded history yet for this client or anything tied to it (policies, opportunities, claims, complaints, endorsements, renewals)."
        />
      )}
    </div>
  );
}

function SummaryList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-slate-900">{title}</p>
      {hasChildren ? <ul className="space-y-2">{children}</ul> : <p className="text-sm text-slate-400">{empty}</p>}
    </div>
  );
}

function SimpleTable({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {headers.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-4 py-6 text-center text-slate-400">{empty}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                {row.map((cell, j) => <td key={j} className="px-4 py-2.5 text-slate-700">{cell}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
