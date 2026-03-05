import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  Procedure,
  ProcedureCreate,
  ProcedureListItem,
  ProcedureTemplate,
  ProcedureTemplateCreate,
  ProcedureTemplateUpdate,
  ProcedureUpdate,
  ParticipantCreate,
  ProcedureParticipant,
  PublicFormData,
} from "@/api/types";

const KEYS = {
  templates: (tenantId?: string) => ["procedures", "templates", tenantId ?? "mine"] as const,
  procedures: ["procedures", "list"] as const,
  procedure: (id: string) => ["procedures", "detail", id] as const,
};

// ── Templates ─────────────────────────────────────────────────────────────────

export function useProcedureTemplates(tenantId?: string) {
  const params = tenantId ? `?tenant_id=${tenantId}` : "";
  return useQuery({
    queryKey: KEYS.templates(tenantId),
    queryFn: () => api.get<ProcedureTemplate[]>(`/procedures/templates${params}`),
  });
}

export function useCreateProcedureTemplate(tenantId?: string) {
  const qc = useQueryClient();
  const params = tenantId ? `?tenant_id=${tenantId}` : "";
  return useMutation({
    mutationFn: (body: ProcedureTemplateCreate) =>
      api.post<ProcedureTemplate>(`/procedures/templates${params}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.templates(tenantId) }),
  });
}

export function useUpdateProcedureTemplate(tenantId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ProcedureTemplateUpdate & { id: string }) =>
      api.patch<ProcedureTemplate>(`/procedures/templates/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.templates(tenantId) }),
  });
}

export function useDeleteProcedureTemplate(tenantId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/procedures/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.templates(tenantId) }),
  });
}

// ── Procédures ────────────────────────────────────────────────────────────────

export function useProcedures() {
  return useQuery({
    queryKey: KEYS.procedures,
    queryFn: () => api.get<ProcedureListItem[]>("/procedures"),
    refetchInterval: (query) => {
      const items = query.state.data as ProcedureListItem[] | undefined;
      const hasActive = items?.some((p) => p.status === "collecting" || p.status === "generating");
      return hasActive ? 5000 : false;
    },
  });
}

export function useProcedure(id: string | null) {
  return useQuery({
    queryKey: KEYS.procedure(id!),
    queryFn: () => api.get<Procedure>(`/procedures/${id}`),
    enabled: !!id,
  });
}

export function useCreateProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProcedureCreate) =>
      api.post<Procedure>("/procedures", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.procedures }),
  });
}

export function useUpdateProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ProcedureUpdate & { id: string }) =>
      api.patch<Procedure>(`/procedures/${id}`, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.procedures });
      qc.invalidateQueries({ queryKey: KEYS.procedure(vars.id) });
    },
  });
}

export function useDeleteProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/procedures/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.procedures }),
  });
}

// ── Participants ──────────────────────────────────────────────────────────────

export function useAddParticipant(procedureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ParticipantCreate) =>
      api.post<ProcedureParticipant>(`/procedures/${procedureId}/participants`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.procedure(procedureId) }),
  });
}

export function useDeleteParticipant(procedureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participantId: string) =>
      api.delete(`/procedures/${procedureId}/participants/${participantId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.procedure(procedureId) }),
  });
}

export function useGenerateConvocation(procedureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ id: string; title: string; status: string }>(
        `/procedures/${procedureId}/generate-convocation`,
        {}
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.procedure(procedureId) }),
  });
}

export function useSendInvitations(procedureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<Procedure>(`/procedures/${procedureId}/send-invitations`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.procedures });
      qc.invalidateQueries({ queryKey: KEYS.procedure(procedureId) });
    },
  });
}

// ── Formulaire public ─────────────────────────────────────────────────────────

export function usePublicForm(token: string) {
  return useQuery({
    queryKey: ["public-form", token],
    queryFn: () => api.get<PublicFormData>(`/forms/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useSubmitForm(token: string) {
  return useMutation({
    mutationFn: (responses: Record<string, string>) =>
      api.post<{ message: string }>(`/forms/${token}/submit`, { responses }),
  });
}
