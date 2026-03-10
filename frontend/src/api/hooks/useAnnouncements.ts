import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { Announcement, AnnouncementCreate, AnnouncementUpdate, ActiveAnnouncement } from "../types";

const KEYS = {
  list: ["admin", "announcements"] as const,
  active: ["announcement", "active"] as const,
};

export function useAnnouncements() {
  return useQuery<Announcement[]>({
    queryKey: KEYS.list,
    queryFn: () => api.get<Announcement[]>("/admin/announcements"),
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AnnouncementCreate) => api.post<Announcement>("/admin/announcements", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AnnouncementUpdate }) =>
      api.patch<Announcement>(`/admin/announcements/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/announcements/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useActiveAnnouncement() {
  return useQuery<ActiveAnnouncement | null>({
    queryKey: KEYS.active,
    queryFn: () => api.get<ActiveAnnouncement | null>("/auth/announcement"),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
