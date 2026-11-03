import { lazy, Suspense, useState, type ComponentType } from "react";
import { useAuth } from "./useAuth";
import LoginView from "./components/LoginView";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
const DashboardView = lazy(() => import("./components/DashboardView"));
const PartiesView = lazy(() => import("./components/PartiesView"));
const PartyProfileView = lazy(() => import("./components/PartyProfileView"));
const OpportunitiesView = lazy(() => import("./components/OpportunitiesView"));
const CorrespondenceView = lazy(() => import("./components/CorrespondenceView"));
const PlacementView = lazy(() => import("./components/PlacementView"));
const PoliciesView = lazy(() => import("./components/PoliciesView"));
const PolicyDetailView = lazy(() => import("./components/PolicyDetailView"));
const RenewalsView = lazy(() => import("./components/RenewalsView"));
const InsurersView = lazy(() => import("./components/InsurersView"));
const ClaimsView = lazy(() => import("./components/ClaimsView"));
const ClaimDetailView = lazy(() => import("./components/ClaimDetailView"));
const ComplaintsView = lazy(() => import("./components/ComplaintsView"));
const FinanceView = lazy(() => import("./components/FinanceView"));
const DocumentsView = lazy(() => import("./components/DocumentsView"));
const TasksView = lazy(() => import("./components/TasksView"));
const ObligationsView = lazy(() => import("./components/ObligationsView"));
const HRView = lazy(() => import("./components/HRView"));
const ProducersView = lazy(() => import("./components/ProducersView"));
const ReceiptsView = lazy(() => import("./components/receipts/ReceiptsView"));
const AnalyticsView = lazy(() => import("./components/analytics/AnalyticsView"));
const SettingsView = lazy(() => import("./components/settings/SettingsView"));
import { TenantProvider } from "./ConfigContext";
import MfaPanel from "./components/MfaPanel";
import { Dialog } from "./components/ui";

export type View =
  | "dashboard" | "parties" | "opportunities" | "correspondence" | "placement" | "policies" | "renewals" | "insurers"
  | "claims" | "complaints" | "finance" | "receipts" | "documents" | "tasks" | "obligations" | "hr" | "producers"
  | "analytics" | "settings";

const VIEWS: Partial<Record<View, ComponentType>> = {
  dashboard: DashboardView,
  opportunities: OpportunitiesView,
  correspondence: CorrespondenceView,
  placement: PlacementView,
  insurers: InsurersView,
  complaints: ComplaintsView,
  finance: FinanceView,
  analytics: AnalyticsView,
  documents: DocumentsView,
  tasks: TasksView,
  obligations: ObligationsView,
  hr: HRView,
  producers: ProducersView,
};

export default function App() {
  const auth = useAuth();
  return <TenantProvider signedIn={Boolean(auth.session)}><Shell {...auth} /></TenantProvider>;
}

function Shell({ session, loading, login, logout, refresh }: ReturnType<typeof useAuth>) {
  const [showSecurity, setShowSecurity] = useState(false);
  const [active, setActive] = useState<View>("dashboard");
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  function handleNavSelect(view: View) {
    setActive(view);
    setSelectedPartyId(null);
    setSelectedPolicyId(null);
    setSelectedClaimId(null);
  }

  const ActiveView = VIEWS[active];

  if (loading) return null;
  if (!session) return <LoginView onLogin={login} />;

  // The organisation requires two-step verification and this person has not set it up yet: that is all they can do for now.
  if (session.mfaEnrollmentRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-lg space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Set up two-step verification</h1>
          <MfaPanel enabled={false} onChanged={refresh} intro="Your organisation requires two-step verification for everyone who signs in. It takes a minute, and you will not be able to continue until it is done." />
          <button type="button" onClick={logout} className="text-xs text-slate-500 hover:text-slate-800">Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar active={active} onSelect={handleNavSelect} staff={session} onLogout={logout} onSecurity={() => setShowSecurity(true)} />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
        <TopBar active={active} />
        <Suspense fallback={<p className="p-4 text-sm text-slate-400" role="status">Loading…</p>}>
        {active === "parties" ? (
          selectedPartyId ? (
            <PartyProfileView partyId={selectedPartyId} onBack={() => setSelectedPartyId(null)} />
          ) : (
            <PartiesView onSelect={setSelectedPartyId} />
          )
        ) : active === "policies" ? (
          selectedPolicyId ? (
            <PolicyDetailView policyId={selectedPolicyId} onBack={() => setSelectedPolicyId(null)} />
          ) : (
            <PoliciesView onSelect={setSelectedPolicyId} canRecordPremium={session.permissions.includes("finance.record")} />
          )
        ) : active === "renewals" ? (
          selectedPolicyId ? (
            <PolicyDetailView policyId={selectedPolicyId} onBack={() => setSelectedPolicyId(null)} backLabel="Back to Renewals" />
          ) : (
            <RenewalsView onSelectPolicy={setSelectedPolicyId} />
          )
        ) : active === "claims" ? (
          selectedClaimId ? (
            <ClaimDetailView claimId={selectedClaimId} onBack={() => setSelectedClaimId(null)} />
          ) : (
            <ClaimsView onSelect={setSelectedClaimId} />
          )
        ) : active === "receipts" ? (
          <ReceiptsView permissions={session.permissions} staffId={session.id} />
        ) : active === "settings" ? (
          <SettingsView permissions={session.permissions} />
        ) : (
          ActiveView && <ActiveView />
        )}
        </Suspense>
      </main>
      {showSecurity && (
        <Dialog title="Account security" onClose={() => setShowSecurity(false)}>
          <MfaPanel enabled={Boolean(session.mfaEnabled)} onChanged={refresh} />
        </Dialog>
      )}
    </div>
  );
}
