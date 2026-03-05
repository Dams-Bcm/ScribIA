import { useState } from "react";
import { Plus, Trash2, Mail, Copy, Check, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useAddParticipant, useDeleteParticipant,
  useSendInvitations, useProcedureTemplates,
} from "@/api/hooks/useProcedures";
import type { Procedure, ProcedureParticipant, FormQuestion } from "@/api/types";

interface Props {
  procedure: Procedure;
}

export function ParticipantManager({ procedure }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { data: procTemplates = [] } = useProcedureTemplates();
  const addParticipant = useAddParticipant(procedure.id);
  const deleteParticipant = useDeleteParticipant(procedure.id);
  const sendInvitations = useSendInvitations(procedure.id);

  // Questions issues du template de procédure pour le rôle sélectionné
  const templateRoles = procTemplates.find((t) => t.id === procedure.template_id)?.roles ?? [];
  const matchingRole = templateRoles.find(
    (r) => r.role_name.toLowerCase() === roleInput.toLowerCase()
  );
  const questionsForRole: FormQuestion[] = matchingRole?.form_questions ?? [];

  function copyFormLink(token: string) {
    const url = `${window.location.origin}/form/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  async function handleAdd() {
    if (!name.trim() || !roleInput.trim()) return;
    await addParticipant.mutateAsync({
      name: name.trim(),
      email: email.trim() || null,
      role_name: roleInput.trim(),
      form_questions: questionsForRole,
    });
    setAddOpen(false);
    setName("");
    setEmail("");
    setRoleInput("");
  }

  const pendingCount = procedure.participants.filter((p) => !p.responded_at).length;
  const canSendInvitations = procedure.participants.length > 0 && procedure.status === "draft";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          Participants
          <span className="ml-2 text-muted-foreground font-normal">
            ({procedure.participants.filter((p) => p.responded_at).length}/{procedure.participants.length} réponses)
          </span>
        </p>
        <div className="flex gap-2">
          {canSendInvitations && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendInvitations.mutate()}
              disabled={sendInvitations.isPending}
            >
              <Mail className="w-3.5 h-3.5 mr-1" />
              {sendInvitations.isPending ? "Envoi…" : `Lancer la collecte (${pendingCount})`}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-1" />
            Ajouter
          </Button>
        </div>
      </div>

      {procedure.participants.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Aucun participant. Ajoutez des participants pour démarrer la collecte.
        </p>
      ) : (
        <div className="space-y-2">
          {procedure.participants.map((p) => (
            <ParticipantRow
              key={p.id}
              participant={p}
              copied={copiedToken === p.form_token}
              onCopy={() => copyFormLink(p.form_token)}
              onDelete={() => deleteParticipant.mutate(p.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un participant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nom *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" />
            </div>
            <div className="space-y-1">
              <Label>Rôle *</Label>
              {templateRoles.length > 0 ? (
                <Select value={roleInput} onValueChange={setRoleInput}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un rôle…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateRoles.map((r) => (
                      <SelectItem key={r.id} value={r.role_name}>{r.role_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={roleInput} onChange={(e) => setRoleInput(e.target.value)} placeholder="Ex : Enseignant, Parent, MOE…" />
              )}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pour envoi futur" type="email" />
            </div>
            {questionsForRole.length > 0 && (
              <p className="text-xs text-muted-foreground bg-muted rounded p-2">
                {questionsForRole.length} question(s) associées au rôle « {roleInput} »
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={!name.trim() || !roleInput.trim() || addParticipant.isPending}>
              {addParticipant.isPending ? "Ajout…" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ParticipantRow({
  participant,
  copied,
  onCopy,
  onDelete,
}: {
  participant: ProcedureParticipant;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{participant.name}</p>
        <p className="text-xs text-muted-foreground">{participant.role_name}</p>
      </div>
      {participant.responded_at ? (
        <Badge variant="outline" className="text-xs flex items-center gap-1 text-green-600 border-green-200">
          <Check className="w-3 h-3" /> Répondu
        </Badge>
      ) : participant.invited_at ? (
        <Badge variant="secondary" className="text-xs">Invité</Badge>
      ) : (
        <Badge variant="outline" className="text-xs text-muted-foreground">En attente</Badge>
      )}
      <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={onCopy} title="Copier le lien du formulaire">
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
      <Button variant="ghost" size="icon" className="flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
