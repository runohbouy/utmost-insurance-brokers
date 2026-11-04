// The test accounts: one per kind of job, so each role's menu and permissions can be tried for real.
// Emails use the reserved ".test" domain, so nothing can ever be delivered to a real mailbox, and every
// account shares one well-known password. These are for development, demos and QA only.
export const TEST_PASSWORD = "ChangeMe123!";

export interface TestUser { fullName: string; email: string; roleId: string; jobTitle: string; department: string; kind: string }

export const TEST_USERS: TestUser[] = [
  { kind: "Administrator", fullName: "Test Administrator", email: "test.admin@utmostbrokers.test", roleId: "admin", jobTitle: "System Administrator", department: "Administration" },
  { kind: "Accountant", fullName: "Test Accountant", email: "test.accountant@utmostbrokers.test", roleId: "accountant", jobTitle: "Accountant", department: "Finance" },
  { kind: "Finance supervisor", fullName: "Test Supervisor", email: "test.supervisor@utmostbrokers.test", roleId: "supervisor", jobTitle: "Finance Supervisor", department: "Finance" },
  { kind: "Underwriter", fullName: "Test Underwriter", email: "test.underwriter@utmostbrokers.test", roleId: "underwriter", jobTitle: "Underwriter", department: "Underwriting" },
  { kind: "Underwriter (desk)", fullName: "Test Desk Underwriter", email: "test.deskunderwriter@utmostbrokers.test", roleId: "underwriter_desk", jobTitle: "Underwriter", department: "Underwriting" },
  { kind: "Claims analyst", fullName: "Test Claims Analyst", email: "test.claims@utmostbrokers.test", roleId: "claims_officer", jobTitle: "Claims Analyst", department: "Claims" },
  { kind: "Operations", fullName: "Test Operations Officer", email: "test.operations@utmostbrokers.test", roleId: "operations", jobTitle: "Operations Officer", department: "Operations" },
  { kind: "HR officer", fullName: "Test HR Officer", email: "test.hr@utmostbrokers.test", roleId: "hr_officer", jobTitle: "HR Officer", department: "Human Resources" },
  { kind: "Sales agent", fullName: "Test Sales Agent", email: "test.sales@utmostbrokers.test", roleId: "sales_agent", jobTitle: "Sales Agent", department: "Sales" },
];
