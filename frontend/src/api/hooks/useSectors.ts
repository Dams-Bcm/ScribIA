import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { SectorDefinition } from "../types";

export function useSectors() {
  return useQuery({
    queryKey: ["sectors"],
    queryFn: () => api.get<SectorDefinition[]>("/admin/sectors"),
  });
}

export function useCreateSector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key: string; label: string; description?: string; default_modules: string[] }) =>
      api.post<SectorDefinition>("/admin/sectors", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sectors"] }),
  });
}

export function useUpdateSector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; label?: string; description?: string; default_modules?: string[]; suggestions?: Record<string, unknown>; is_active?: boolean }) =>
      api.patch<SectorDefinition>(`/admin/sectors/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sectors"] }),
  });
}

export function useDeleteSector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/sectors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sectors"] }),
  });
}

export function useGenerateSuggestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectorId: string) =>
      api.post<SectorDefinition>(`/admin/sectors/${sectorId}/generate-suggestions`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sectors"] }),
  });
}
