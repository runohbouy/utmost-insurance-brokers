import { useState } from "react";
import { Tabs } from "../ui";
import ConfigEditor from "./ConfigEditor";
import PortalUsersPanel from "./PortalUsersPanel";
import VersionsPanel from "./VersionsPanel";

type Tab = "configuration" | "versions" | "portal";

/** Tenant administration: how this organisation operates (region, tax, brand, plan, money rules) and who may use the client portal. */
export default function SettingsView({ permissions }: { permissions: string[] }) {
  const canConfigure = permissions.includes("tenant_config.manage");
  const canPortal = permissions.includes("portal.manage");
  const tabs = [
    ...(canConfigure ? [{ id: "configuration" as Tab, label: "Configuration" }, { id: "versions" as Tab, label: "Version history" }] : []),
    ...(canPortal ? [{ id: "portal" as Tab, label: "Client portal access" }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? "configuration");

  if (tabs.length === 0) return <p className="text-sm text-slate-500">You do not have access to the settings.</p>;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
      <Tabs<Tab> label="Settings sections" value={tab} onChange={setTab} tabs={tabs} />
      {tab === "configuration" && canConfigure && <ConfigEditor />}
      {tab === "versions" && canConfigure && <VersionsPanel />}
      {tab === "portal" && canPortal && <PortalUsersPanel />}
    </div>
  );
}
