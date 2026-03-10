import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  ContactGroup,
  ContactGroupDetail,
  ContactGroupCreate,
  ContactGroupUpdate,
  Contact,
  ContactCreate,
  ContactUpdate,
} from "@/api/types";

// ── Excel helpers ─────────────────────────────────────────────────────────────

function downloadFile(path: string, filename: string) {
  const token = localStorage.getItem("token");
  return fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((res) => {
      if (!res.ok) throw new Error("Download failed");
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
}

export function downloadContactsExport(groupId?: string | null) {
  const qs = groupId && groupId !== "__all__" ? `?group_id=${groupId}` : "";
  return downloadFile(`/contacts/export${qs}`, "contacts.xlsx");
}

export function downloadContactsTemplate() {
  return downloadFile("/contacts/template", "modele_contacts.xlsx");
}

const KEYS = {
  groups: ["contacts", "groups"] as const,
  group: (id: string) => ["contacts", "group", id] as const,
};

// ── Groups ───────────────────────────────────────────────────────────────────

export function useContactGroups() {
  return useQuery({
    queryKey: KEYS.groups,
    queryFn: () => api.get<ContactGroup[]>("/contacts/groups"),
  });
}

export function useContactGroup(id: string | null) {
  return useQuery({
    queryKey: KEYS.group(id!),
    queryFn: () =>
      id === "__all__"
        ? api.get<ContactGroupDetail>("/contacts/all")
        : api.get<ContactGroupDetail>(`/contacts/groups/${id}`),
    enabled: !!id,
  });
}

export function useCreateContactGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ContactGroupCreate) =>
      api.post<ContactGroupDetail>("/contacts/groups", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.groups }),
  });
}

export function useUpdateContactGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ContactGroupUpdate & { id: string }) =>
      api.patch<ContactGroup>(`/contacts/groups/${id}`, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.groups });
      qc.invalidateQueries({ queryKey: KEYS.group(vars.id) });
    },
  });
}

export function useDeleteContactGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.groups }),
  });
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export function useAddContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ...body }: ContactCreate & { groupId: string }) =>
      api.post<Contact>(`/contacts/groups/${groupId}/contacts`, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.group(vars.groupId) });
      qc.invalidateQueries({ queryKey: KEYS.group("__all__") });
      qc.invalidateQueries({ queryKey: KEYS.groups });
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      contactId,
      ...body
    }: ContactUpdate & { groupId: string; contactId: string }) =>
      api.patch<Contact>(
        `/contacts/groups/${groupId}/contacts/${contactId}`,
        body,
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.group(vars.groupId) });
      qc.invalidateQueries({ queryKey: KEYS.groups });
    },
  });
}

export function useResetEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) =>
      api.delete(`/speakers/${profileId}/enrollment`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["admin", "speakers"] });
      qc.invalidateQueries({ queryKey: ["speakers", "contacts-for-enrollment"] });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      contactId,
    }: {
      groupId: string;
      contactId: string;
    }) => api.delete(`/contacts/groups/${groupId}/contacts/${contactId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.group(vars.groupId) });
      qc.invalidateQueries({ queryKey: KEYS.groups });
    },
  });
}

export function useAddContactToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, groupId }: { contactId: string; groupId: string }) =>
      api.post(`/contacts/contacts/${contactId}/groups/${groupId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.group(vars.groupId) });
      qc.invalidateQueries({ queryKey: KEYS.group("__all__") });
      qc.invalidateQueries({ queryKey: KEYS.groups });
    },
  });
}

export function useRemoveContactFromGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, groupId }: { contactId: string; groupId: string }) =>
      api.delete(`/contacts/contacts/${contactId}/groups/${groupId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.group(vars.groupId) });
      qc.invalidateQueries({ queryKey: KEYS.group("__all__") });
      qc.invalidateQueries({ queryKey: KEYS.groups });
    },
  });
}

export function useImportContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, file }: { groupId: string; file: File }) =>
      api.upload<{ created: number; errors: string[] }>(
        `/contacts/import?group_id=${groupId}`,
        file,
        file.name,
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.group(vars.groupId) });
      qc.invalidateQueries({ queryKey: KEYS.group("__all__") });
      qc.invalidateQueries({ queryKey: KEYS.groups });
    },
  });
}
