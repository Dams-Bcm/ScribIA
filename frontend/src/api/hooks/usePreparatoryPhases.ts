import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  PreparatoryDossier,
  PreparatoryDossierDetail,
  DossierCreate,
  DossierUpdate,
  AgendaPoint,
  AgendaPointCreate,
  DossierDocument,
} from "../types";

const KEYS = {
  list: ["preparatory-phases", "dossiers"] as const,
  detail: (id: string) => ["preparatory-phases", "dossier", id] as const,
};

// ── Dossiers ──────────────────────────────────────────────────────────────────

export function useDossiers() {
  return useQuery<PreparatoryDossier[]>({
    queryKey: KEYS.list,
    queryFn: () => api.get<PreparatoryDossier[]>("/preparatory-phases"),
  });
}

export function useDossier(id: string | null) {
  return useQuery<PreparatoryDossierDetail>({
    queryKey: KEYS.detail(id!),
    queryFn: () => api.get<PreparatoryDossierDetail>(`/preparatory-phases/${id}`),
    enabled: !!id,
  });
}

export function useCreateDossier() {
  const qc = useQueryClient();
  return useMutation<PreparatoryDossierDetail, Error, DossierCreate>({
    mutationFn: (body) => api.post<PreparatoryDossierDetail>("/preparatory-phases", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useUpdateDossier() {
  const qc = useQueryClient();
  return useMutation<PreparatoryDossierDetail, Error, { id: string; body: DossierUpdate }>({
    mutationFn: ({ id, body }) => api.patch<PreparatoryDossierDetail>(`/preparatory-phases/${id}`, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useDeleteDossier() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete<void>(`/preparatory-phases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

// ── Agenda Points ─────────────────────────────────────────────────────────────

export function useAddPoint() {
  const qc = useQueryClient();
  return useMutation<AgendaPoint, Error, { dossierId: string; body: AgendaPointCreate }>({
    mutationFn: ({ dossierId, body }) =>
      api.post<AgendaPoint>(`/preparatory-phases/${dossierId}/points`, body),
    onSuccess: (_, { dossierId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(dossierId) });
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useUpdatePoint() {
  const qc = useQueryClient();
  return useMutation<AgendaPoint, Error, { dossierId: string; pointId: string; body: Partial<AgendaPointCreate> }>({
    mutationFn: ({ dossierId, pointId, body }) =>
      api.patch<AgendaPoint>(`/preparatory-phases/${dossierId}/points/${pointId}`, body),
    onSuccess: (_, { dossierId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(dossierId) });
    },
  });
}

export function useDeletePoint() {
  const qc = useQueryClient();
  return useMutation<void, Error, { dossierId: string; pointId: string }>({
    mutationFn: ({ dossierId, pointId }) =>
      api.delete<void>(`/preparatory-phases/${dossierId}/points/${pointId}`),
    onSuccess: (_, { dossierId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(dossierId) });
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useReorderPoints() {
  const qc = useQueryClient();
  return useMutation<AgendaPoint[], Error, { dossierId: string; pointIds: string[] }>({
    mutationFn: ({ dossierId, pointIds }) =>
      api.put<AgendaPoint[]>(`/preparatory-phases/${dossierId}/points/reorder`, { point_ids: pointIds }),
    onSuccess: (_, { dossierId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(dossierId) });
    },
  });
}

// ── Documents ─────────────────────────────────────────────────────────────────

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation<DossierDocument, Error, { dossierId: string; file: File; agendaPointId?: string }>({
    mutationFn: ({ dossierId, file, agendaPointId }) => {
      const qp = agendaPointId ? `?agenda_point_id=${agendaPointId}` : "";
      return api.upload<DossierDocument>(`/preparatory-phases/${dossierId}/documents${qp}`, file);
    },
    onSuccess: (_, { dossierId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(dossierId) });
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation<void, Error, { dossierId: string; docId: string }>({
    mutationFn: ({ dossierId, docId }) =>
      api.delete<void>(`/preparatory-phases/${dossierId}/documents/${docId}`),
    onSuccess: (_, { dossierId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(dossierId) });
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}
