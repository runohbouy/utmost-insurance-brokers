// Class-specific risk data collection — what's actually needed to
// assess a risk varies by class (motor needs a logbook/registration;
// medical needs a date of birth and a pre-existing-conditions
// declaration; property needs construction type). Stored in
// Risk.exposureAttributes; classes with no entry here just skip the
// dynamic questionnaire and the mandatory-field check entirely. Kept
// in sync by hand with RISK_CLASS_REQUIRED_FIELDS in server.ts, which
// enforces the `required: true` fields before a risk can go to market.
export interface RiskClassField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "select";
  required: boolean;
  options?: string[];
}

export const RISK_CLASS_FIELDS: Record<string, RiskClassField[]> = {
  "07": [
    { key: "registrationNumber", label: "Vehicle registration number", type: "text", required: true },
    { key: "makeModel", label: "Make and model", type: "text", required: true },
    { key: "yearOfManufacture", label: "Year of manufacture", type: "number", required: true },
    { key: "usage", label: "Usage", type: "select", required: true, options: ["private", "commercial", "psv"] },
    { key: "previousClaims", label: "Previous claims (last 3 years)", type: "number", required: false },
    { key: "securityDevices", label: "Security devices fitted", type: "text", required: false },
  ],
  "08": [
    { key: "registrationNumber", label: "Vehicle registration number", type: "text", required: true },
    { key: "makeModel", label: "Make and model", type: "text", required: true },
    { key: "yearOfManufacture", label: "Year of manufacture", type: "number", required: true },
    { key: "usage", label: "Usage", type: "select", required: true, options: ["general_cartage", "own_goods", "psv", "special_vehicle"] },
    { key: "previousClaims", label: "Previous claims (last 3 years)", type: "number", required: false },
    { key: "securityDevices", label: "Security devices fitted", type: "text", required: false },
  ],
  "12": [
    { key: "dateOfBirth", label: "Date of birth", type: "date", required: true },
    { key: "familyComposition", label: "Family composition / number of dependants", type: "text", required: false },
    { key: "preExistingConditions", label: "Declaration of pre-existing conditions (or 'None')", type: "textarea", required: true },
    { key: "chronicMaternityRequirements", label: "Chronic/maternity requirements", type: "textarea", required: false },
  ],
  "03": [
    { key: "constructionType", label: "Construction type", type: "text", required: true },
    { key: "occupancy", label: "Occupancy", type: "text", required: true },
    { key: "fireProtection", label: "Fire protection systems", type: "text", required: false },
    { key: "previousLosses", label: "Previous losses", type: "textarea", required: false },
  ],
  "04": [
    { key: "constructionType", label: "Construction type", type: "text", required: true },
    { key: "occupancy", label: "Occupancy", type: "text", required: true },
    { key: "fireProtection", label: "Fire protection systems", type: "text", required: false },
    { key: "previousLosses", label: "Previous losses", type: "textarea", required: false },
  ],
  "05": [
    { key: "businessActivity", label: "Business activity", type: "text", required: true },
    { key: "turnoverKes", label: "Annual turnover (KES)", type: "number", required: true },
    { key: "numberOfEmployees", label: "Number of employees", type: "number", required: false },
    { key: "previousClaims", label: "Previous claims", type: "textarea", required: false },
  ],
  "09": [
    { key: "occupation", label: "Occupation", type: "text", required: true },
    { key: "previousClaims", label: "Previous claims", type: "textarea", required: false },
  ],
};
