import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { Tenant, TenantCreate, TenantUpdate, ModuleDefinition, ProvisionResult } from "../types";

export function useTenants() {
  return useQuery<Tenant[]>({
    queryKey: ["admin", "tenants"],
    queryFn: () => api.get<Tenant[]>("/admin/tenants"),
  });
}

export function useAvailableModules() {
  return useQuery<ModuleDefinition[]>({
    queryKey: ["admin", "modules"],
    queryFn: () => api.get<ModuleDefinition[]>("/admin/modules"),
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TenantCreate) => api.post<Tenant>("/admin/tenants", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tenants"] }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TenantUpdate }) =>
      api.patch<Tenant>(`/admin/tenants/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tenants"] }),
  });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/tenants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tenants"] }),
  });
}

export function useUpdateTenantModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, modules }: { tenantId: string; modules: { module_key: string; enabled: boolean }[] }) =>
      api.put(`/admin/tenants/${tenantId}/modules`, modules),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tenants"] }),
  });
}

export function useProvisionTenant() {
  return useMutation({
    mutationFn: (tenantId: string) => api.post<ProvisionResult>(`/admin/tenants/${tenantId}/provision`, {}),
  });
}
