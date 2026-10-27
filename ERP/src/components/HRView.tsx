import { Fragment, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import type { Staff, Role, Employee, LeaveType, LeaveBalance, LeaveRequest, PerformanceReview } from "../types";
import StatusPill from "./StatusPill";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

const EMPTY_EMPLOYEE_FORM = {
  fullName: "", email: "", phoneNumber: "", password: "", roleId: "", supervisorId: "",
  jobTitle: "", department: "", branch: "", employmentType: "full_time",
  hireDate: new Date().toISOString().slice(0, 10), nationalId: "", kraPin: "",
  emergencyContactName: "", emergencyContactPhone: "", baseSalaryKes: "",
};
const EMPTY_EMPLOYEE_EDIT = {
  jobTitle: "", department: "", branch: "", employmentType: "full_time", employmentStatus: "active",
  baseSalaryKes: "", nationalId: "", kraPin: "", emergencyContactName: "", emergencyContactPhone: "",
  terminationDate: "", terminationReason: "",
};
const EMPTY_LEAVE_FORM = { staffId: "", leaveTypeId: "annual", startDate: "", endDate: "", reason: "" };
const EMPTY_REVIEW_FORM = { staffId: "", periodStart: "", periodEnd: "", rating: "meets", strengths: "", areasForImprovement: "", goals: "" };

const TABS = [
  { id: "employees", label: "Employees" },
  { id: "leave", label: "Leave" },
  { id: "performance", label: "Performance" },
] as const;

const EMPLOYMENT_STATUS_TONE: Record<string, "good" | "warning" | "critical" | "neutral"> = {
  active: "good", on_leave: "warning", suspended: "warning", terminated: "critical",
};
const LEAVE_STATUS_TONE: Record<string, "good" | "warning" | "critical" | "neutral"> = {
  requested: "warning", approved: "good", rejected: "critical", cancelled: "neutral",
};
const REVIEW_STATUS_TONE: Record<string, "good" | "warning" | "critical" | "neutral"> = {
  draft: "neutral", submitted: "warning", acknowledged: "good",
};

export default function HRView() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [rolesList, setRolesList] = useState<Role[]>([]);
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("employees");

  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const [employeeEdit, setEmployeeEdit] = useState(EMPTY_EMPLOYEE_EDIT);

  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState(EMPTY_LEAVE_FORM);

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState(EMPTY_REVIEW_FORM);
  const [query, setQuery] = useState("");
  const [staffPage, setStaffPage] = useState(0);
  const [leaveBalancePage, setLeaveBalancePage] = useState(0);
  const [leaveRequestPage, setLeaveRequestPage] = useState(0);
  const [reviewPage, setReviewPage] = useState(0);

  function load() {
    setLoading(true);
    setInitialLoadFailed(false);
    Promise.all([
      api.staff.list(), api.roles.list(), api.employees.list(),
      api.leaveTypes.list(), api.leaveBalances.list(), api.leaveRequests.list(),
      api.performanceReviews.list(),
    ])
      .then(([s, r, e, lt, lb, lr, pr]) => {
        setStaffList(s); setRolesList(r); setEmployeesList(e);
        setLeaveTypes(lt); setLeaveBalances(lb); setLeaveRequests(lr);
        setReviews(pr);
      })
      .catch((err) => { setError(err.message); setInitialLoadFailed(true); })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const staffName = (id: string | null) => (id ? staffList.find((s) => s.id === id)?.fullName || id : "—");
  const roleLabel = (id: string | null) => (id ? rolesList.find((r) => r.id === id)?.name || id : "—");
  const leaveTypeName = (id: string) => leaveTypes.find((t) => t.id === id)?.name || id;
  const employeeFor = (staffId: string) => employeesList.find((e) => e.staffId === staffId);

  async function handleCreateEmployee(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.staff.create({
        fullName: employeeForm.fullName,
        email: employeeForm.email || undefined,
        phoneNumber: employeeForm.phoneNumber || undefined,
        password: employeeForm.password || undefined,
        roleId: employeeForm.roleId || undefined,
        supervisorId: employeeForm.supervisorId || undefined,
        jobTitle: employeeForm.jobTitle || undefined,
        department: employeeForm.department || undefined,
        branch: employeeForm.branch || undefined,
        employmentType: employeeForm.employmentType,
        hireDate: employeeForm.hireDate,
        nationalId: employeeForm.nationalId || undefined,
        kraPin: employeeForm.kraPin || undefined,
        emergencyContactName: employeeForm.emergencyContactName || undefined,
        emergencyContactPhone: employeeForm.emergencyContactPhone || undefined,
        baseSalaryKes: employeeForm.baseSalaryKes ? Number(employeeForm.baseSalaryKes) : undefined,
      });
      setEmployeeForm(EMPTY_EMPLOYEE_FORM);
      setShowEmployeeForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleExpand(staffId: string) {
    if (expandedStaffId === staffId) {
      setExpandedStaffId(null);
      return;
    }
    const emp = employeeFor(staffId);
    setEmployeeEdit({
      jobTitle: emp?.jobTitle || "", department: emp?.department || "", branch: emp?.branch || "",
      employmentType: emp?.employmentType || "full_time", employmentStatus: emp?.employmentStatus || "active",
      baseSalaryKes: emp?.baseSalaryKes != null ? String(emp.baseSalaryKes) : "",
      nationalId: emp?.nationalId || "", kraPin: emp?.kraPin || "",
      emergencyContactName: emp?.emergencyContactName || "", emergencyContactPhone: emp?.emergencyContactPhone || "",
      terminationDate: emp?.terminationDate || "", terminationReason: emp?.terminationReason || "",
    });
    setExpandedStaffId(staffId);
  }

  async function handleUpdateEmployee(e: React.FormEvent, staffId: string) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.employees.update(staffId, {
        jobTitle: employeeEdit.jobTitle || undefined,
        department: employeeEdit.department || undefined,
        branch: employeeEdit.branch || undefined,
        employmentType: employeeEdit.employmentType as Employee["employmentType"],
        employmentStatus: employeeEdit.employmentStatus as Employee["employmentStatus"],
        baseSalaryKes: employeeEdit.baseSalaryKes ? Number(employeeEdit.baseSalaryKes) : undefined,
        nationalId: employeeEdit.nationalId || undefined,
        kraPin: employeeEdit.kraPin || undefined,
        emergencyContactName: employeeEdit.emergencyContactName || undefined,
        emergencyContactPhone: employeeEdit.emergencyContactPhone || undefined,
        terminationDate: employeeEdit.terminationDate || undefined,
        terminationReason: employeeEdit.terminationReason || undefined,
      });
      setEmployeesList((prev) => prev.map((x) => (x.staffId === staffId ? updated : x)));
      const s = await api.staff.list();
      setStaffList(s);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateLeaveRequest(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.leaveRequests.create(leaveForm);
      setLeaveRequests((prev) => [created, ...prev]);
      setLeaveForm(EMPTY_LEAVE_FORM);
      setShowLeaveForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLeaveDecision(id: string, status: LeaveRequest["status"]) {
    setError(null);
    try {
      const updated = await api.leaveRequests.update(id, { status });
      setLeaveRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
      const lb = await api.leaveBalances.list();
      setLeaveBalances(lb);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateReview(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.performanceReviews.create({ ...reviewForm, rating: reviewForm.rating as PerformanceReview["rating"] });
      setReviews((prev) => [created, ...prev]);
      setReviewForm(EMPTY_REVIEW_FORM);
      setShowReviewForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReviewStatus(id: string, status: PerformanceReview["status"]) {
    setError(null);
    try {
      const updated = await api.performanceReviews.update(id, { status });
      setReviews((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (initialLoadFailed) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;

  const staffFiltered = staffList.filter((s) => {
    const emp = employeeFor(s.id);
    return matchesQuery(query, s.fullName, roleLabel(s.roleId), emp?.jobTitle, emp?.department, emp?.employmentStatus);
  });
  const leaveRequestsFiltered = leaveRequests.filter((r) => matchesQuery(query, staffName(r.staffId), leaveTypeName(r.leaveTypeId), r.status));
  const reviewsFiltered = reviews.filter((r) => matchesQuery(query, staffName(r.staffId), staffName(r.reviewerId), r.rating, r.status));
  const { pageItems: staffPageItems, totalPages: staffTotalPages, clampedPage: staffClampedPage } = usePagedSlice(staffFiltered, staffPage);
  const { pageItems: leaveBalancesPageItems, totalPages: leaveBalancesTotalPages, clampedPage: leaveBalancesClampedPage } = usePagedSlice(leaveBalances, leaveBalancePage);
  const { pageItems: leaveRequestsPageItems, totalPages: leaveRequestsTotalPages, clampedPage: leaveRequestsClampedPage } = usePagedSlice(leaveRequestsFiltered, leaveRequestPage);
  const { pageItems: reviewsPageItems, totalPages: reviewsTotalPages, clampedPage: reviewsClampedPage } = usePagedSlice(reviewsFiltered, reviewPage);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">HR</h2>
      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={tab === "employees" ? "Search by name, role, job title, department, status…" : tab === "leave" ? "Search by staff, leave type, status…" : "Search by staff, reviewer, rating, status…"}
      />

      {tab === "employees" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Employee records are a 1:1 HR extension of a staff login — creating one creates both. Recruitment/payroll/attendance/training aren't part of this build yet.</p>
            <button onClick={() => setShowEmployeeForm((v) => !v)} className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Plus size={15} /> New employee
            </button>
          </div>
          {showEmployeeForm && (
            <form onSubmit={handleCreateEmployee} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <input required placeholder="Full name" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.fullName} onChange={(e) => setEmployeeForm({ ...employeeForm, fullName: e.target.value })} />
              <input placeholder="Email" type="email" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} />
              <input placeholder="Phone number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.phoneNumber} onChange={(e) => setEmployeeForm({ ...employeeForm, phoneNumber: e.target.value })} />
              <input placeholder="Login password (optional)" type="password" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.password} onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })} />
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.roleId} onChange={(e) => setEmployeeForm({ ...employeeForm, roleId: e.target.value })}>
                <option value="">No role</option>
                {rolesList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.supervisorId} onChange={(e) => setEmployeeForm({ ...employeeForm, supervisorId: e.target.value })}>
                <option value="">No supervisor</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
              <input placeholder="Job title" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.jobTitle} onChange={(e) => setEmployeeForm({ ...employeeForm, jobTitle: e.target.value })} />
              <input placeholder="Department" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} />
              <input placeholder="Branch" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.branch} onChange={(e) => setEmployeeForm({ ...employeeForm, branch: e.target.value })} />
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.employmentType} onChange={(e) => setEmployeeForm({ ...employeeForm, employmentType: e.target.value })}>
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
              <input type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.hireDate} onChange={(e) => setEmployeeForm({ ...employeeForm, hireDate: e.target.value })} />
              <input placeholder="Base salary (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.baseSalaryKes} onChange={(e) => setEmployeeForm({ ...employeeForm, baseSalaryKes: e.target.value })} />
              <input placeholder="National ID" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.nationalId} onChange={(e) => setEmployeeForm({ ...employeeForm, nationalId: e.target.value })} />
              <input placeholder="KRA PIN" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.kraPin} onChange={(e) => setEmployeeForm({ ...employeeForm, kraPin: e.target.value })} />
              <input placeholder="Emergency contact name" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.emergencyContactName} onChange={(e) => setEmployeeForm({ ...employeeForm, emergencyContactName: e.target.value })} />
              <input placeholder="Emergency contact phone" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={employeeForm.emergencyContactPhone} onChange={(e) => setEmployeeForm({ ...employeeForm, emergencyContactPhone: e.target.value })} />
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving…" : "Create employee"}
              </button>
            </form>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Job title</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Department</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Login</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {staffFiltered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">{staffList.length === 0 ? "No staff yet." : `No staff match "${query}".`}</td></tr>
                ) : (
                  staffPageItems.map((s) => {
                    const emp = employeeFor(s.id);
                    const expanded = expandedStaffId === s.id;
                    return (
                      <Fragment key={s.id}>
                        <tr onClick={() => toggleExpand(s.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-900">{s.fullName}</td>
                          <td className="px-4 py-2.5 text-slate-600">{roleLabel(s.roleId)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{emp?.jobTitle || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-600">{emp?.department || "—"}</td>
                          <td className="px-4 py-2.5">{emp && <StatusPill status={emp.employmentStatus} tone={EMPLOYMENT_STATUS_TONE[emp.employmentStatus]} />}</td>
                          <td className="px-4 py-2.5"><StatusPill status={s.active ? "active" : "inactive"} tone={s.active ? "good" : "critical"} /></td>
                          <td className="px-4 py-2.5 text-right text-xs text-indigo-600">{expanded ? "Hide" : "View"}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <td colSpan={7} className="px-4 py-4">
                              <form onSubmit={(e) => handleUpdateEmployee(e, s.id)} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <input placeholder="Job title" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.jobTitle} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, jobTitle: ev.target.value })} />
                                <input placeholder="Department" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.department} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, department: ev.target.value })} />
                                <input placeholder="Branch" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.branch} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, branch: ev.target.value })} />
                                <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.employmentType} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, employmentType: ev.target.value })}>
                                  <option value="full_time">Full-time</option>
                                  <option value="part_time">Part-time</option>
                                  <option value="contract">Contract</option>
                                  <option value="intern">Intern</option>
                                </select>
                                <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.employmentStatus} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, employmentStatus: ev.target.value })}>
                                  <option value="active">Active</option>
                                  <option value="on_leave">On leave</option>
                                  <option value="suspended">Suspended</option>
                                  <option value="terminated">Terminated</option>
                                </select>
                                <input placeholder="Base salary (KES)" type="number" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.baseSalaryKes} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, baseSalaryKes: ev.target.value })} />
                                <input placeholder="National ID" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.nationalId} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, nationalId: ev.target.value })} />
                                <input placeholder="KRA PIN" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.kraPin} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, kraPin: ev.target.value })} />
                                <input placeholder="Emergency contact name" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.emergencyContactName} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, emergencyContactName: ev.target.value })} />
                                <input placeholder="Emergency contact phone" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.emergencyContactPhone} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, emergencyContactPhone: ev.target.value })} />
                                {employeeEdit.employmentStatus === "terminated" && (
                                  <>
                                    <input type="date" placeholder="Termination date" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.terminationDate} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, terminationDate: ev.target.value })} />
                                    <input placeholder="Termination reason" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={employeeEdit.terminationReason} onChange={(ev) => setEmployeeEdit({ ...employeeEdit, terminationReason: ev.target.value })} />
                                  </>
                                )}
                                <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                                  {saving ? "Saving…" : "Save changes"}
                                </button>
                              </form>
                              <p className="mt-2 text-xs text-slate-400">Setting status to Terminated revokes this person's login; setting it back to Active restores it.</p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
            <Pagination page={staffClampedPage} totalPages={staffTotalPages} totalItems={staffFiltered.length} onChange={setStaffPage} />
          </div>
        </div>
      )}

      {tab === "leave" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Leave balances</h3>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Staff</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Leave type</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Year</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Allocated</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Used</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {leaveBalances.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No leave balances yet.</td></tr>
                ) : (
                  leaveBalancesPageItems.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{staffName(b.staffId)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{leaveTypeName(b.leaveTypeId)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-500">{b.year}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{b.allocatedDays + b.carriedOverDays}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{b.usedDays}</td>
                      <td className="px-4 py-2.5 tabular-nums font-medium text-slate-900">{b.allocatedDays + b.carriedOverDays - b.usedDays}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination page={leaveBalancesClampedPage} totalPages={leaveBalancesTotalPages} totalItems={leaveBalances.length} onChange={setLeaveBalancePage} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <h3 className="text-base font-semibold text-slate-900">Leave requests</h3>
            <button onClick={() => setShowLeaveForm((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Plus size={15} /> New request
            </button>
          </div>
          {showLeaveForm && (
            <form onSubmit={handleCreateLeaveRequest} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={leaveForm.staffId} onChange={(e) => setLeaveForm({ ...leaveForm, staffId: e.target.value })}>
                <option value="">Select staff…</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={leaveForm.leaveTypeId} onChange={(e) => setLeaveForm({ ...leaveForm, leaveTypeId: e.target.value })}>
                {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input required type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
              <input required type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
              <input placeholder="Reason" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving…" : "Submit request"}
              </button>
            </form>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Staff</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Dates</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Days</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {leaveRequestsFiltered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{leaveRequests.length === 0 ? "No leave requests yet." : `No leave requests match "${query}".`}</td></tr>
                ) : (
                  leaveRequestsPageItems.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{staffName(r.staffId)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{leaveTypeName(r.leaveTypeId)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-500">{r.startDate} → {r.endDate}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.daysRequested}</td>
                      <td className="px-4 py-2.5"><StatusPill status={r.status} tone={LEAVE_STATUS_TONE[r.status]} /></td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-2 text-xs">
                          {r.status === "requested" && (
                            <>
                              <button onClick={() => handleLeaveDecision(r.id, "approved")} className="font-medium text-emerald-600 hover:underline">Approve</button>
                              <button onClick={() => handleLeaveDecision(r.id, "rejected")} className="font-medium text-rose-600 hover:underline">Reject</button>
                              <button onClick={() => handleLeaveDecision(r.id, "cancelled")} className="text-slate-500 hover:underline">Cancel</button>
                            </>
                          )}
                          {r.status === "approved" && (
                            <button onClick={() => handleLeaveDecision(r.id, "cancelled")} className="text-slate-500 hover:underline">Cancel</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination page={leaveRequestsClampedPage} totalPages={leaveRequestsTotalPages} totalItems={leaveRequestsFiltered.length} onChange={setLeaveRequestPage} />
          </div>
        </div>
      )}

      {tab === "performance" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Performance reviews</h3>
            <button onClick={() => setShowReviewForm((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Plus size={15} /> New review
            </button>
          </div>
          {showReviewForm && (
            <form onSubmit={handleCreateReview} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={reviewForm.staffId} onChange={(e) => setReviewForm({ ...reviewForm, staffId: e.target.value })}>
                <option value="">Select staff…</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
              <input required type="date" placeholder="Period start" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={reviewForm.periodStart} onChange={(e) => setReviewForm({ ...reviewForm, periodStart: e.target.value })} />
              <input required type="date" placeholder="Period end" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={reviewForm.periodEnd} onChange={(e) => setReviewForm({ ...reviewForm, periodEnd: e.target.value })} />
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}>
                <option value="exceeds">Exceeds expectations</option>
                <option value="meets">Meets expectations</option>
                <option value="below">Below expectations</option>
                <option value="unsatisfactory">Unsatisfactory</option>
              </select>
              <textarea placeholder="Strengths" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-3" value={reviewForm.strengths} onChange={(e) => setReviewForm({ ...reviewForm, strengths: e.target.value })} />
              <textarea placeholder="Areas for improvement" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-3" value={reviewForm.areasForImprovement} onChange={(e) => setReviewForm({ ...reviewForm, areasForImprovement: e.target.value })} />
              <textarea placeholder="Goals for next period" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-3" value={reviewForm.goals} onChange={(e) => setReviewForm({ ...reviewForm, goals: e.target.value })} />
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving…" : "Save as draft"}
              </button>
            </form>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Staff</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Reviewer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Period</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Rating</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {reviewsFiltered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{reviews.length === 0 ? "No performance reviews yet." : `No reviews match "${query}".`}</td></tr>
                ) : (
                  reviewsPageItems.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{staffName(r.staffId)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{staffName(r.reviewerId)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-500">{r.periodStart} → {r.periodEnd}</td>
                      <td className="px-4 py-2.5 capitalize text-slate-600">{r.rating || "—"}</td>
                      <td className="px-4 py-2.5"><StatusPill status={r.status} tone={REVIEW_STATUS_TONE[r.status]} /></td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        {r.status === "draft" && <button onClick={() => handleReviewStatus(r.id, "submitted")} className="font-medium text-indigo-600 hover:underline">Submit</button>}
                        {r.status === "submitted" && <button onClick={() => handleReviewStatus(r.id, "acknowledged")} className="font-medium text-emerald-600 hover:underline">Acknowledge</button>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination page={reviewsClampedPage} totalPages={reviewsTotalPages} totalItems={reviewsFiltered.length} onChange={setReviewPage} />
          </div>
        </div>
      )}
    </div>
  );
}
