import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  TranscriptionJob,
  TranscriptionJobDetail,
  TranscriptionUploadResponse,
} from "../types";

const KEYS = {
  list: ["transcription", "jobs"] as const,
  detail: (id: string) => ["transcription", "job", id] as const,
};

export function useTranscriptionJobs() {
  return useQuery<TranscriptionJob[]>({
    queryKey: KEYS.list,
    queryFn: () => api.get<TranscriptionJob[]>("/transcription"),
  });
}

export function useTranscriptionJob(id: string | null) {
  return useQuery<TranscriptionJobDetail>({
    queryKey: KEYS.detail(id!),
    queryFn: () => api.get<TranscriptionJobDetail>(`/transcription/${id}`),
    enabled: !!id,
  });
}

export function useUploadAudio() {
  const qc = useQueryClient();
  return useMutation<TranscriptionUploadResponse, Error, { file: File | Blob; filename?: string }>({
    mutationFn: ({ file, filename }) =>
      api.upload<TranscriptionUploadResponse>("/transcription/upload", file, filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useStartProcessing() {
  const qc = useQueryClient();
  return useMutation<TranscriptionJob, Error, string>({
    mutationFn: (jobId) => api.post<TranscriptionJob>(`/transcription/${jobId}/process`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useStartPartialAnalysis() {
  const qc = useQueryClient();
  return useMutation<TranscriptionJob, Error, string>({
    mutationFn: (jobId) => api.post<TranscriptionJob>(`/transcription/${jobId}/partial-analysis`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useProceedToFullTranscription() {
  const qc = useQueryClient();
  return useMutation<TranscriptionJob, Error, string>({
    mutationFn: (jobId) => api.post<TranscriptionJob>(`/transcription/${jobId}/proceed`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (jobId) => api.delete<void>(`/transcription/${jobId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}
