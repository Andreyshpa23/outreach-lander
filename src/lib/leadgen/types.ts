/**
 * Leadgen types: ICP (from Cursor), Job, Lead, Apollo API shapes.
 */

export interface IcpGeo {
  countries?: string[];
  regions?: string[];
  cities?: string[];
}

export interface IcpPositions {
  titles_strict?: string[];
  titles_broad?: string[];
  seniority?: string[];
  departments?: string[];
}

export interface IcpCompanySize {
  employee_ranges?: string[];
}

export interface Icp {
  geo?: IcpGeo;
  positions?: IcpPositions;
  industries?: string[];
  company_size?: IcpCompanySize;
}

export interface LeadgenLimits {
  target_leads?: number;
  max_runtime_ms?: number;
}

export interface LeadgenJobInput {
  job_id?: string;
  icp: Icp;
  limits?: LeadgenLimits;
}

export interface Lead {
  full_name: string;
  title: string;
  location: string;
  linkedin_url: string;
  company_name: string;
  company_website: string;
  company_industry: string;
  company_employee_range: string;
  source: "apollo";
  apollo_person_id: string;
  confidence_score: number;
}

export interface LeadgenJobResult {
  job_id: string;
  status: "queued" | "running" | "done" | "failed";
  icp_used?: Icp;
  leads_count: number;
  leads_preview: Lead[];
  download_csv_url: string | null;
  debug: {
    apollo_requests?: number;
    widening_steps_applied?: string[];
    partial_due_to_timeout?: boolean;
    [key: string]: unknown;
  };
  error: string | null;
  created_at?: string;
  updated_at?: string;
}

export type WideningStep =
  | "strict"
  | "broad_titles"
  | "relax_seniority"
  | "relax_geo"
  | "relax_company_size"
  | "relax_industries";
