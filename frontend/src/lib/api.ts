import type {
  Application,
  ApplicationStatus,
  Job,
  Page,
  User,
} from "@/lib/types";

const proxyBase = "/api/backend/api/v1";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function request<T>(
  path: string,
  options: {
    token?: string | null;
    method?: string;
    body?: BodyInit | null;
    json?: unknown;
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  let body = options.body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  const response = await fetch(`${proxyBase}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed (${response.status})`;
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function register(
  email: string,
  password: string,
  role: User["role"],
): Promise<void> {
  await request<User>("/auth/register", {
    method: "POST",
    json: { email, password, role },
  });
}

export async function login(
  email: string,
  password: string,
): Promise<{ access_token: string; token_type: string }> {
  return request("/auth/login", {
    method: "POST",
    json: { email, password },
  });
}

export function searchJobs(
  params: URLSearchParams,
): Promise<Page<Job>> {
  const query = params.toString();
  return request(`/jobs${query ? `?${query}` : ""}`);
}

export function getMyJobs(token: string): Promise<Page<Job>> {
  return request("/jobs/mine?page_size=100", { token });
}

export function getMyApplications(token: string): Promise<Page<Application>> {
  return request("/applications/mine?page_size=100", { token });
}

export function getJobApplications(
  jobId: number,
  token: string,
): Promise<Page<Application>> {
  return request(`/applications/jobs/${jobId}?page_size=100`, { token });
}

export function updateApplicationStatus(
  applicationId: number,
  status: ApplicationStatus,
  token: string,
): Promise<Application> {
  return request(`/applications/${applicationId}/status`, {
    token,
    method: "PATCH",
    json: { status },
  });
}
