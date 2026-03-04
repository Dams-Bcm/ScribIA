import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Shield, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface AuditEntry {
  id: string;
  timestamp: string;
  user_id: string | null;
  tenant_id: string | null;
  action: string;
  resource: string | null;
  resource_id: string | null;
  ip_address: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  login_success: "bg-emerald-100 text-emerald-800",
  login_failed: "bg-red-100 text-red-800",
  data_export_request: "bg-blue-100 text-blue-800",
  data_deletion_request: "bg-red-100 text-red-800",
  consent_given: "bg-emerald-100 text-emerald-800",
  consent_revoked: "bg-amber-100 text-amber-800",
};

export function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const { data: logs = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: ["admin", "audit-logs"],
    queryFn: () => api.get("/admin/audit-logs"),
  });

  const filtered = logs.filter(
    (l) =>
      !search ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.ip_address?.includes(search) ||
      l.user_id?.includes(search),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Journal d'audit</h1>
          <p className="text-sm text-muted-foreground">
            {logs.length} entrée{logs.length !== 1 ? "s" : ""} — RGPD Art. 30
          </p>
        </div>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par action, IP, utilisateur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="bg-background rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
              <th className="text-left px-4 py-3 font-medium">Ressource</th>
              <th className="text-left px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log) => (
              <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString("fr-FR")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {log.resource ? `${log.resource}${log.resource_id ? ` #${log.resource_id.slice(0, 8)}` : ""}` : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{log.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{search ? "Aucun résultat" : "Aucune entrée d'audit"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
