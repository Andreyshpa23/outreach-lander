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
  /** Keywords for company name / keywords / description search (Apollo q_keywords). */
  industry_keywords?: string[];
  company_size?: IcpCompanySize;
}

export interface LeadgenLimits {
  target_leads?: number;
  max_runtime_ms?: number;
}

/** Product + segments (without leads) for MinIO payload; leads = LinkedIn URLs from Apollo */
export interface LeadgenMinioPayload {
  product: { name: string; description: string; goal_type: string; goal_description: string };
  segments: Array<{ name: string; personalization: string; outreach_personalization?: string; dialog_personalization?: string }>;
}

export interface LeadgenJobInput {
  job_id?: string;
  icp: Icp;
  limits?: LeadgenLimits;
  /** Optional: for saving to MinIO with leads = LinkedIn URLs only */
  minio_payload?: LeadgenMinioPayload;
  /** If set, worker overwrites this MinIO object with leads (instead of creating new file) */
  minio_key_to_update?: string;
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
  /** Only LinkedIn URLs from Apollo (for MinIO format) */
  linkedin_urls: string[];
  leads_preview: Lead[];
  download_csv_url: string | null;
  /** Set after saving to MinIO (object key for cookie demo_st_minio_id) */
  minio_object_key?: string | null;
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
