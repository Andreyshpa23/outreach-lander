"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

const DEFAULT_ICP = {
  geo: { countries: ["United States"] },
  positions: { titles_strict: ["CEO", "Founder"] },
  industries: ["Technology"],
  company_size: { employee_ranges: ["1,10", "11,50"] },
};

const LIMITS = { target_leads: 10, max_runtime_ms: 30000 };

const MINIO_PAYLOAD = {
  product: {
    name: "Apollo leads",
    description: "LinkedIn URLs from Apollo",
    goal_type: "MANUAL_GOAL",
    goal_description: "Надо забукать с ним кол, попроси его прислать удобные слоты для созвона или его календли",
  },
  segments: [{ name: "Apollo", personalization: "" }],
};
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 60000;

type JobResult = {
  job_id: string;
  status: string;
  leads_count: number;
  linkedin_urls?: string[];
  leads_preview: Array<{
    full_name: string;
    title: string;
    company_name: string;
    linkedin_url: string;
    apollo_person_id?: string;
    location?: string;
  }>;
  download_csv_url: string | null;
  minio_object_key?: string | null;
  error: string | null;
  debug?: Record<string, unknown>;
};

function setCookie(name: string, value: string, days: number = 30) {
  if (typeof document === "undefined") return;
  try {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;domain=.salestrigger.io;SameSite=Lax`;
  } catch (_) {}
}

export default function TestLeadgenPage() {
  const [status, setStatus] = useState<"idle" | "creating" | "running" | "done" | "error">("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runTest() {
    setStatus("creating");
    setError(null);
    setResult(null);
    setJobId(null);

    try {
      const createRes = await fetch("/api/leadgen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          icp: DEFAULT_ICP,
          limits: LIMITS,
          minio_payload: MINIO_PAYLOAD,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.job_id) {
        throw new Error(createJson.error || "Failed to create job");
      }
      const id = createJson.job_id;
      setJobId(id);
      setStatus("running");

      await fetch("/api/leadgen/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: id }),
      });

      const start = Date.now();
      while (Date.now() - start < POLL_MAX_MS) {
        const getRes = await fetch(`/api/leadgen/${id}`);
        const data = (await getRes.json()) as JobResult;
        setResult(data);
        if (data.status === "done" || data.status === "failed") {
          setStatus(data.status === "done" ? "done" : "error");
          if (data.status === "failed" && data.error) setError(data.error);
          if (data.status === "done" && data.minio_object_key) {
            setCookie("demo_st_minio_id", data.minio_object_key, 30);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      setStatus("error");
      setError("Timeout waiting for result");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
            ← На главную
          </Link>
          <h1 className="text-xl font-semibold text-zinc-900">Тест Apollo: сбор базы</h1>
        </div>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="p-6">
            <h2 className="mb-2 text-sm font-medium text-zinc-700">Что отдаёт Apollo API</h2>
            <p className="mb-4 text-xs text-zinc-500">
              Эндпоинт: POST api.apollo.io/api/v1/mixed_people/api_search. В ответе — массив <code className="rounded bg-zinc-100 px-1">people</code> и <code className="rounded bg-zinc-100 px-1">pagination</code>. У каждого человека: id, name (или first_name/last_name), title, city, state, country, linkedin_url, organization (name, primary_domain, industry, estimated_num_employees). Мы мапим это в Lead: full_name, title, location, linkedin_url, company_name, company_website, company_industry, company_employee_range, apollo_person_id. Подробно: <code className="rounded bg-zinc-100 px-1">docs/APOLLO_OUTPUT.md</code>.
            </p>
            <h2 className="mb-4 text-sm font-medium text-zinc-700">Критерии (тестовый инпут)</h2>
            <pre className="mb-6 rounded-lg bg-zinc-100 p-4 text-xs text-zinc-800">
              {JSON.stringify({ icp: DEFAULT_ICP, limits: LIMITS }, null, 2)}
            </pre>
            <Button
              onClick={runTest}
              disabled={status === "creating" || status === "running"}
              className="bg-zinc-900 text-white hover:bg-zinc-800"
            >
              {status === "creating"
                ? "Создаём задачу..."
                : status === "running"
                  ? "Собираем базу..."
                  : "Собрать базу"}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <p className="text-sm text-red-800">{error}</p>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card className="border-zinc-200 bg-white">
            <CardContent className="p-6">
              <h2 className="mb-4 text-sm font-medium text-zinc-700">Результат</h2>
              <div className="mb-4 flex flex-wrap gap-4 text-sm">
                <span>
                  <strong>Job ID:</strong> {result.job_id}
                </span>
                <span>
                  <strong>Status:</strong> {result.status}
                </span>
                <span>
                  <strong>Лидов (только LinkedIn URL):</strong> {result.leads_count}
                </span>
                {result.minio_object_key && (
                  <span className="text-green-600">
                    MinIO: сохранено, cookie demo_st_minio_id = {result.minio_object_key}
                  </span>
                )}
                {result.status === "done" && (result.leads_count ?? 0) > 0 && !result.minio_object_key && (result.debug as { minio_error?: string } | undefined)?.minio_error && (
                  <span className="text-amber-600">
                    MinIO: запись не прошла — {(result.debug as { minio_error: string }).minio_error}
                  </span>
                )}
                {result.download_csv_url && (
                  <a
                    href={result.download_csv_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Скачать CSV
                  </a>
                )}
              </div>
              {result.leads_preview && result.leads_preview.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-zinc-600">
                        <th className="p-2">Имя</th>
                        <th className="p-2">Должность</th>
                        <th className="p-2">Компания</th>
                        <th className="p-2">LinkedIn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.leads_preview.map((lead, i) => (
                        <tr key={i} className="border-b border-zinc-100">
                          <td className="p-2">{lead.full_name}</td>
                          <td className="p-2">{lead.title}</td>
                          <td className="p-2">{lead.company_name}</td>
                          <td className="p-2">
                            {lead.linkedin_url && lead.linkedin_url.includes("linkedin.com") ? (
                              <a
                                href={lead.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                LinkedIn
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.debug && Object.keys(result.debug).length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-zinc-500">Debug</summary>
                  <pre className="mt-2 rounded bg-zinc-100 p-2 text-xs text-zinc-700">
                    {JSON.stringify(result.debug, null, 2)}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
