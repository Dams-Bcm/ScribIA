import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  ComplianceDashboard,
  RetentionPolicy,
  RetentionPolicyCreate,
  RGPDRequest,
  AuditLogEntry,
} from "../types";

const KEYS = {
  dashboard: ["compliance", "dashboard"] as const,
  policies: ["compliance", "retention-policies"] as const,
  requests: ["compliance", "requests"] as const,
  auditLogs: ["compliance", "audit-logs"] as const,
};

export function useComplianceDashboard() {
  return useQuery<ComplianceDashboard>({
    queryKey: KEYS.dashboard,
    queryFn: () => api.get<ComplianceDashboard>("/compliance/dashboard"),
  });
}

export function useRetentionPolicies() {
  return useQuery<RetentionPolicy[]>({
    queryKey: KEYS.policies,
    queryFn: () => api.get<RetentionPolicy[]>("/compliance/retention-policies"),
  });
}

export function useCreateRetentionPolicy() {
  const qc = useQueryClient();
  return useMutation<RetentionPolicy, Error, RetentionPolicyCreate>({
    mutationFn: (body) => api.post<RetentionPolicy>("/compliance/retention-policies", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.policies });
      qc.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useUpdateRetentionPolicy() {
  const qc = useQueryClient();
  return useMutation<RetentionPolicy, Error, { id: string; body: Partial<RetentionPolicyCreate> }>({
    mutationFn: ({ id, body }) => api.patch<RetentionPolicy>(`/compliance/retention-policies/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.policies });
      qc.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useDeleteRetentionPolicy() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete<void>(`/compliance/retention-policies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.policies });
      qc.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useRGPDRequests(status?: string) {
  return useQuery<RGPDRequest[]>({
    queryKey: [...KEYS.requests, status ?? "all"],
    queryFn: () => {
      const params = status ? `?status=${status}` : "";
      return api.get<RGPDRequest[]>(`/compliance/requests${params}`);
    },
  });
}

export function useCreateRGPDRequest() {
  const qc = useQueryClient();
  return useMutation<RGPDRequest, Error, { request_type: string; user_id: string; notes?: string }>({
    mutationFn: (body) => api.post<RGPDRequest>("/compliance/requests", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.requests });
      qc.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useUpdateRGPDRequest() {
  const qc = useQueryClient();
  return useMutation<RGPDRequest, Error, { id: string; body: { status?: string; admin_notes?: string } }>({
    mutationFn: ({ id, body }) => api.patch<RGPDRequest>(`/compliance/requests/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.requests });
      qc.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useComplianceAuditLogs(limit: number = 200) {
  return useQuery<AuditLogEntry[]>({
    queryKey: [...KEYS.auditLogs, limit],
    queryFn: () => api.get<AuditLogEntry[]>(`/compliance/audit-logs?limit=${limit}`),
  });
}
