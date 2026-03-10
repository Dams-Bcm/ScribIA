import { Loader2, Users, Database, Shield, AlertTriangle } from "lucide-react";
import { useComplianceDashboard } from "@/api/hooks/useCompliance";

export function ComplianceDashboard() {
  const { data, isLoading } = useComplianceDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const { consent_metrics, retention_policies, audit_summary, pending_requests_count, overdue_requests_count } = data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Consentements */}
      <div className="bg-background rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Consentements</h3>
            <p className="text-xs text-muted-foreground">Taux de consentement</p>
          </div>
        </div>
        <div className="mb-3">
          <div className="flex items-end gap-2 mb-1">
            <span className="text-3xl font-bold">{consent_metrics.consent_rate}%</span>
            <span className="text-sm text-muted-foreground mb-1">
              ({consent_metrics.users_with_consent}/{consent_metrics.total_users} utilisateurs)
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(consent_metrics.consent_rate, 100)}%` }}
            />
          </div>
        </div>
        {Object.keys(consent_metrics.by_type).length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border">
            {Object.entries(consent_metrics.by_type).map(([type, metric]) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{type}</span>
                <span>
                  <span className="text-emerald-600 font-medium">{metric.granted}</span>
                  {metric.revoked > 0 && (
                    <span className="text-red-500 ml-2">-{metric.revoked}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Politiques de rétention */}
      <div className="bg-background rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Politiques de rétention</h3>
            <p className="text-xs text-muted-foreground">Durées de conservation</p>
          </div>
        </div>
        <div className="text-3xl font-bold mb-3">{retention_policies.length}</div>
        {retention_policies.length === 0 ? (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            Aucune politique configurée. Configurez vos durées de rétention dans l'onglet "Rétention".
          </p>
        ) : (
          <div className="space-y-1.5">
            {retention_policies.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{p.data_type}</span>
                <span className="font-medium">
                  {p.retention_days === "indefinite" ? "Indéfini" : `${p.retention_days}j`}
                </span>
              </div>
            ))}
            {retention_policies.length > 4 && (
              <p className="text-xs text-muted-foreground">+{retention_policies.length - 4} autres</p>
            )}
          </div>
        )}
      </div>

      {/* Audit */}
      <div className="bg-background rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Journal d'audit</h3>
            <p className="text-xs text-muted-foreground">Activité récente (7 jours)</p>
          </div>
        </div>
        <div className="flex items-end gap-2 mb-3">
          <span className="text-3xl font-bold">{audit_summary.recent_events}</span>
          <span className="text-sm text-muted-foreground mb-1">/ {audit_summary.total_events} total</span>
        </div>
        {Object.keys(audit_summary.by_action).length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border">
            {Object.entries(audit_summary.by_action).slice(0, 5).map(([action, count]) => (
              <div key={action} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{action}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Demandes RGPD */}
      <div className="bg-background rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            overdue_requests_count > 0
              ? "bg-red-50 text-red-600"
              : pending_requests_count > 0
              ? "bg-amber-50 text-amber-600"
              : "bg-emerald-50 text-emerald-600"
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Demandes RGPD</h3>
            <p className="text-xs text-muted-foreground">En attente de traitement</p>
          </div>
        </div>
        <div className="text-3xl font-bold mb-3">{pending_requests_count}</div>
        {overdue_requests_count > 0 && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {overdue_requests_count} demande(s) en dépassement du délai légal de 30 jours
          </p>
        )}
        {pending_requests_count === 0 && overdue_requests_count === 0 && (
          <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
            Aucune demande en attente
          </p>
        )}
      </div>
    </div>
  );
}
