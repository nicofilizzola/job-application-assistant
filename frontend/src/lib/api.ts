import "server-only";

import type { components } from "@/lib/api-types";

export type ApplicationListItem = components["schemas"]["ApplicationListItem"];
export type ApplicationDetail = components["schemas"]["ApplicationDetail"];
export type ApplicationCreate = components["schemas"]["ApplicationCreate"];
export type ApplicationPatch = components["schemas"]["ApplicationPatch"];
export type StatusUpdateCreate = components["schemas"]["StatusUpdateCreate"];
export type StatusUpdatePatch = components["schemas"]["StatusUpdatePatch"];
export type StatusUpdateRead = components["schemas"]["StatusUpdateRead"];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Backend responded ${status}: ${body}`);
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${required("BACKEND_URL")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": required("BACKEND_API_KEY"),
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new ApiError(response.status, await response.text());
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function listApplications(includeClosed: boolean) {
  return call<ApplicationListItem[]>(`/applications?include_closed=${includeClosed}`);
}

export function getApplication(id: string) {
  return call<ApplicationDetail>(`/applications/${id}`);
}

export function createApplication(body: ApplicationCreate) {
  return call<ApplicationDetail>("/applications", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchApplication(id: string, body: ApplicationPatch) {
  return call<ApplicationDetail>(`/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteApplication(id: string) {
  return call<void>(`/applications/${id}`, { method: "DELETE" });
}

export function addStatusUpdate(id: string, body: StatusUpdateCreate) {
  return call<ApplicationDetail>(`/applications/${id}/status-updates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchStatusUpdate(
  applicationId: string,
  updateId: string,
  body: StatusUpdatePatch,
) {
  return call<ApplicationDetail>(`/applications/${applicationId}/status-updates/${updateId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteStatusUpdate(applicationId: string, updateId: string) {
  return call<void>(`/applications/${applicationId}/status-updates/${updateId}`, {
    method: "DELETE",
  });
}
