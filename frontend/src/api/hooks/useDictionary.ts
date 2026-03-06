import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { SubstitutionRule, SubstitutionRuleCreate, SubstitutionRuleUpdate, SubstitutionPreview } from "../types";

const KEYS = {
  rules: ["dictionary", "rules"] as const,
  categories: ["dictionary", "categories"] as const,
};

export function useDictionaryRules(category?: string) {
  return useQuery<SubstitutionRule[]>({
    queryKey: [...KEYS.rules, category],
    queryFn: () => api.get<SubstitutionRule[]>(`/dictionary/rules${category ? `?category=${encodeURIComponent(category)}` : ""}`),
  });
}

export function useDictionaryCategories() {
  return useQuery<string[]>({
    queryKey: KEYS.categories,
    queryFn: () => api.get<string[]>("/dictionary/categories"),
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SubstitutionRuleCreate) => api.post<SubstitutionRule>("/dictionary/rules", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.rules });
      qc.invalidateQueries({ queryKey: KEYS.categories });
    },
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SubstitutionRuleUpdate }) =>
      api.patch<SubstitutionRule>(`/dictionary/rules/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.rules }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/dictionary/rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.rules });
      qc.invalidateQueries({ queryKey: KEYS.categories });
    },
  });
}

export function usePreviewSubstitutions() {
  return useMutation({
    mutationFn: (text: string) => api.post<SubstitutionPreview>("/dictionary/preview", { text }),
  });
}

export function useImportRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: SubstitutionRuleCreate[]) => api.post<{ imported: number }>("/dictionary/import", rules),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.rules });
      qc.invalidateQueries({ queryKey: KEYS.categories });
    },
  });
}

export function useApplyDictionary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { target_type: "transcription" | "ai_document"; target_id: string }) =>
      api.post<{ rules_applied: number; target_type: string; target_id: string }>("/dictionary/apply", body),
    onSuccess: (_data, variables) => {
      if (variables.target_type === "transcription") {
        qc.invalidateQueries({ queryKey: ["transcription"] });
      } else {
        qc.invalidateQueries({ queryKey: ["ai-documents"] });
      }
      qc.invalidateQueries({ queryKey: KEYS.rules });
    },
  });
}
