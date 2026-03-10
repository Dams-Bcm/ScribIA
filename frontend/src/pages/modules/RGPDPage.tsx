import { useState } from "react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComplianceDashboard } from "@/components/compliance/ComplianceDashboard";
import { RetentionPolicies } from "@/components/compliance/RetentionPolicies";
import { RGPDRequests } from "@/components/compliance/RGPDRequests";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "retention", label: "Rétention" },
  { key: "requests", label: "Demandes RGPD" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function RGPDPage() {
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <Shield className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-bold">RGPD</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Gestion de la conformité RGPD de votre tenant
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "dashboard" && <ComplianceDashboard />}
      {tab === "retention" && <RetentionPolicies />}
      {tab === "requests" && <RGPDRequests />}
    </div>
  );
}
