import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  AIDocument,
  AIDocumentListItem,
  AIDocumentTemplate,
  AIDocumentTemplateCreate,
  AIDocumentTemplateUpdate,
  GenerateRequest,
  OllamaModelsResponse,
} from "@/api/types";

const KEYS = {
  templates: ["ai-documents", "templates"] as const,
  template: (id: string) => ["ai-documents", "template", id] as const,
  globalTemplates: ["ai-documents", "global-templates"] as const,
  documents: ["ai-documents", "documents"] as const,
  document: (id: string) => ["ai-documents", "document", id] as const,
  ollamaModels: ["ai-documents", "ollama-models"] as const,
};

// ── Templates ─────────────────────────────────────────────────────────────────

export function useTemplates() {
  return useQuery({
    queryKey: KEYS.templates,
    queryFn: () => api.get<AIDocumentTemplate[]>("/ai-documents/templates"),
  });
}

export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: KEYS.template(id!),
    queryFn: () => api.get<AIDocumentTemplate>(`/ai-documents/templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AIDocumentTemplateCreate) =>
      api.post<AIDocumentTemplate>("/ai-documents/templates", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.templates }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: AIDocumentTemplateUpdate & { id: string }) =>
      api.patch<AIDocumentTemplate>(`/ai-documents/templates/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.templates }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/ai-documents/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.templates }),
  });
}

// ── Workflow generation ──────────────────────────────────────────────────────

export function useGenerateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<AIDocumentTemplate>(`/ai-documents/templates/${id}/generate-workflow`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.templates });
      qc.invalidateQueries({ queryKey: KEYS.globalTemplates });
    },
  });
}

export function useGenerateGlobalWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<AIDocumentTemplate>(`/ai-documents/global-templates/${id}/generate-workflow`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.globalTemplates }),
  });
}

// ── Global Templates (super_admin) ───────────────────────────────────────────

export function useGlobalTemplates() {
  return useQuery({
    queryKey: KEYS.globalTemplates,
    queryFn: () => api.get<AIDocumentTemplate[]>("/ai-documents/global-templates"),
  });
}

export function useCreateGlobalTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AIDocumentTemplateCreate) =>
      api.post<AIDocumentTemplate>("/ai-documents/global-templates", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.globalTemplates }),
  });
}

export function useUpdateGlobalTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: AIDocumentTemplateUpdate & { id: string }) =>
      api.patch<AIDocumentTemplate>(`/ai-documents/global-templates/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.globalTemplates }),
  });
}

export function useDeleteGlobalTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/ai-documents/global-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.globalTemplates }),
  });
}

export function useAssignGlobalTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, tenantIds }: { templateId: string; tenantIds: string[] }) =>
      api.put<AIDocumentTemplate>(`/ai-documents/global-templates/${templateId}/assign`, {
        tenant_ids: tenantIds,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.globalTemplates }),
  });
}

// ── Export / Import ───────────────────────────────────────────────────────

export async function downloadTemplatesExport() {
  const blob = await api.rawGet("/ai-documents/templates/export");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "templates_export.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function useImportTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.postForm<{ created: number; errors: string[] }>(
        "/ai-documents/templates/import",
        form,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.templates }),
  });
}

// ── Modèles Ollama ────────────────────────────────────────────────────────────

export function useOllamaModels() {
  return useQuery({
    queryKey: KEYS.ollamaModels,
    queryFn: () => api.get<OllamaModelsResponse>("/ai-documents/ollama-models"),
    staleTime: 60_000,
  });
}

// ── Documents générés ─────────────────────────────────────────────────────────

export function useAIDocuments() {
  return useQuery({
    queryKey: KEYS.documents,
    queryFn: () => api.get<AIDocumentListItem[]>("/ai-documents/documents"),
    refetchInterval: (query) => {
      const docs = query.state.data as AIDocumentListItem[] | undefined;
      const hasActive = docs?.some((d) => d.status === "pending" || d.status === "generating");
      return hasActive ? 2000 : false;
    },
  });
}

export function useAIDocument(id: string | null) {
  return useQuery({
    queryKey: KEYS.document(id!),
    queryFn: () => api.get<AIDocument>(`/ai-documents/documents/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = (query.state.data as AIDocument | undefined)?.status;
      return status === "pending" || status === "generating" ? 2000 : false;
    },
  });
}

export function useGenerateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateRequest) =>
      api.post<AIDocument>("/ai-documents/generate", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.documents }),
  });
}

export function useUpdateAIDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; result_text: string }) =>
      api.patch<AIDocument>(`/ai-documents/documents/${id}`, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.document(vars.id) });
      qc.invalidateQueries({ queryKey: KEYS.documents });
    },
  });
}

export function useDeleteAIDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/ai-documents/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.documents }),
  });
}
