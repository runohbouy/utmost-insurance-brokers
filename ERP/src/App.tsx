import { useState, type ReactElement } from "react";
import { useAuth } from "./useAuth";
import LoginView from "./components/LoginView";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import DashboardView from "./components/DashboardView";
import PartiesView from "./components/PartiesView";
import PartyProfileView from "./components/PartyProfileView";
import OpportunitiesView from "./components/OpportunitiesView";
import CorrespondenceView from "./components/CorrespondenceView";
import PlacementView from "./components/PlacementView";
import PoliciesView from "./components/PoliciesView";
import PolicyDetailView from "./components/PolicyDetailView";
import RenewalsView from "./components/RenewalsView";
import InsurersView from "./components/InsurersView";
import ClaimsView from "./components/ClaimsView";
import ClaimDetailView from "./components/ClaimDetailView";
import ComplaintsView from "./components/ComplaintsView";
import FinanceView from "./components/FinanceView";
import DocumentsView from "./components/DocumentsView";
import TasksView from "./components/TasksView";
import ObligationsView from "./components/ObligationsView";
import HRView from "./components/HRView";
import ProducersView from "./components/ProducersView";

export type View =
  | "dashboard" | "parties" | "opportunities" | "correspondence" | "placement" | "policies" | "renewals" | "insurers"
  | "claims" | "complaints" | "finance" | "documents" | "tasks" | "obligations" | "hr" | "producers";

const VIEWS: Partial<Record<View, () => ReactElement>> = {
  dashboard: DashboardView,
  opportunities: OpportunitiesView,
  correspondence: CorrespondenceView,
  placement: PlacementView,
  insurers: InsurersView,
  complaints: ComplaintsView,
  finance: FinanceView,
  documents: DocumentsView,
  tasks: TasksView,
  obligations: ObligationsView,
  hr: HRView,
  producers: ProducersView,
};

export default function App() {
  const { session, loading, login, logout } = useAuth();
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

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar active={active} onSelect={handleNavSelect} staff={session} onLogout={logout} />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
        <TopBar active={active} />
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
        ) : (
          ActiveView && <ActiveView />
        )}
      </main>
    </div>
  );
}
