import { useState } from "react";
import { useSectors, useCreateSector, useUpdateSector, useDeleteSector, useGenerateSuggestions } from "../../api/hooks/useSectors";
import { AVAILABLE_MODULES } from "../../api/types";
import type { SectorSuggestions } from "../../api/types";
import { FolderCog, Plus, Trash2, X, Loader2, Sparkles, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SectorsPage() {
  const { data: sectors = [], isLoading } = useSectors();
  const createSector = useCreateSector();
  const updateSector = useUpdateSector();
  const deleteSector = useDeleteSector();
  const generateSuggestions = useGenerateSuggestions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ key: "", label: "", description: "", default_modules: [] as string[] });
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [suggestionsDraft, setSuggestionsDraft] = useState<SectorSuggestions | null>(null);
  const [descSaved, setDescSaved] = useState(false);
  const [suggSaved, setSuggSaved] = useState(false);

  const selected = sectors.find((s) => s.id === selectedId) ?? null;

  function handleCreate() {
    if (!form.key.trim() || !form.label.trim()) return;
    createSector.mutate(
      {
        key: form.key.trim().toLowerCase().replace(/\s+/g, "_"),
        label: form.label.trim(),
        description: form.description.trim() || undefined,
        default_modules: form.default_modules,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm({ key: "", label: "", description: "", default_modules: [] });
        },
      },
    );
  }

  function handleDelete(id: string) {
    if (confirm("Supprimer ce secteur ?")) {
      deleteSector.mutate(id);
      if (selectedId === id) setSelectedId(null);
    }
  }

  function toggleModule(moduleKey: string) {
    if (!selected) return;
    const currentModules: string[] = selected.default_modules || [];
    const newModules = currentModules.includes(moduleKey)
      ? currentModules.filter((m) => m !== moduleKey)
      : [...currentModules, moduleKey];
    updateSector.mutate({ id: selected.id, default_modules: newModules });
  }

  function handleSelectSector(id: string) {
    setSelectedId(id);
    setDescDraft(null);
    setSuggestionsDraft(null);
    setDescSaved(false);
    setSuggSaved(false);
  }

  function handleSaveDescription() {
    if (!selected || descDraft === null) return;
    updateSector.mutate(
      { id: selected.id, description: descDraft },
      {
        onSuccess: () => {
          setDescDraft(null);
          setDescSaved(true);
          setTimeout(() => setDescSaved(false), 2000);
        },
      },
    );
  }

  function handleSaveSuggestions() {
    if (!selected || !suggestionsDraft) return;
    updateSector.mutate(
      { id: selected.id, suggestions: suggestionsDraft },
      {
        onSuccess: () => {
          setSuggestionsDraft(null);
          setSuggSaved(true);
          setTimeout(() => setSuggSaved(false), 2000);
        },
      },
    );
  }

  function handleGenerate() {
    if (!selected) return;
    generateSuggestions.mutate(selected.id, {
      onSuccess: () => setSuggestionsDraft(null),
    });
  }

  const currentDesc = descDraft ?? selected?.description ?? "";
  const currentSuggestions = suggestionsDraft ?? selected?.suggestions ?? null;

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
          <h1 className="text-2xl font-bold">Secteurs d'activité</h1>
          <p className="text-sm text-muted-foreground">
            Gérez les secteurs, leurs modules et suggestions contextuelles
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Nouveau secteur
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* Sector list */}
        <div className="space-y-1">
          {sectors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderCog className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Aucun secteur configuré</p>
            </div>
          ) : (
            sectors.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelectSector(s.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  selectedId === s.id
                    ? "bg-primary/5 border border-primary/20"
                    : "hover:bg-accent border border-transparent"
                }`}
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium block truncate">{s.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">{s.key}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selected ? (
            <div className="space-y-6">
              {/* General info */}
              <div className="bg-background rounded-xl border border-border p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-bold">{selected.label}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{selected.key}</p>
                </div>

                <div className="mb-4">
                  <Label className="text-sm font-medium mb-1.5 block">Libellé</Label>
                  <Input
                    defaultValue={selected.label}
                    key={selected.id + "-label"}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val && val !== selected.label) {
                        updateSector.mutate({ id: selected.id, label: val });
                      }
                    }}
                    className="text-sm"
                  />
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-sm font-medium">Description du secteur</Label>
                    {descDraft !== null && (
                      <Button size="sm" variant="outline" onClick={handleSaveDescription} disabled={updateSector.isPending}>
                        {descSaved ? (
                          <><Check className="w-3.5 h-3.5 mr-1" /> Sauvegardé</>
                        ) : (
                          <><Save className="w-3.5 h-3.5 mr-1" /> Sauvegarder</>
                        )}
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={currentDesc}
                    onChange={(e) => setDescDraft(e.target.value)}
                    placeholder="Décrivez le contexte métier de ce secteur (utilisé par l'IA pour générer les suggestions)..."
                    rows={3}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Cette description est utilisée par l'IA pour générer des suggestions contextuelles.
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 block">Modules par défaut</Label>
                  <div className="space-y-2">
                    {AVAILABLE_MODULES.map((mod) => {
                      const enabled = (selected.default_modules || []).includes(mod.key);
                      return (
                        <label key={mod.key} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => toggleModule(mod.key)}
                            className="w-4 h-4 rounded border-input"
                          />
                          <span className="text-sm">{mod.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Suggestions */}
              <div className="bg-background rounded-xl border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold">Suggestions contextuelles</h3>
                    <p className="text-xs text-muted-foreground">
                      Générées par l'IA ou éditables manuellement
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {suggestionsDraft && (
                      <Button size="sm" variant="outline" onClick={handleSaveSuggestions} disabled={updateSector.isPending}>
                        {suggSaved ? (
                          <><Check className="w-3.5 h-3.5 mr-1" /> Sauvegardé</>
                        ) : (
                          <><Save className="w-3.5 h-3.5 mr-1" /> Sauvegarder</>
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={handleGenerate}
                      disabled={generateSuggestions.isPending || !currentDesc.trim()}
                    >
                      {generateSuggestions.isPending ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Génération…</>
                      ) : (
                        <><Sparkles className="w-3.5 h-3.5 mr-1" /> Générer par IA</>
                      )}
                    </Button>
                  </div>
                </div>

                {!currentSuggestions && !generateSuggestions.isPending && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Aucune suggestion. Ajoutez une description puis cliquez sur "Générer par IA".</p>
                  </div>
                )}

                {currentSuggestions && (
                  <div className="space-y-4">
                    <SuggestionList
                      label="Recherche intelligente"
                      items={currentSuggestions.search ?? []}
                      onChange={(items) => setSuggestionsDraft({ ...currentSuggestions, search: items })}
                    />
                    <SuggestionList
                      label="Documents IA"
                      items={currentSuggestions.ai_documents ?? []}
                      onChange={(items) => setSuggestionsDraft({ ...currentSuggestions, ai_documents: items })}
                    />
                    <SuggestionList
                      label="Labels locuteurs (Transcription)"
                      items={currentSuggestions.transcription?.speaker_labels ?? []}
                      onChange={(items) =>
                        setSuggestionsDraft({
                          ...currentSuggestions,
                          transcription: { ...currentSuggestions.transcription, speaker_labels: items },
                        })
                      }
                    />
                    <SuggestionList
                      label="Procédures types"
                      items={currentSuggestions.procedures ?? []}
                      onChange={(items) => setSuggestionsDraft({ ...currentSuggestions, procedures: items })}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-background rounded-xl border border-border p-12 text-center text-muted-foreground">
              <FolderCog className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sélectionnez un secteur pour le configurer</p>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl border border-border p-6 w-full max-w-md shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nouveau secteur</h2>
              <button onClick={() => setShowCreate(false)}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="mb-1.5">Libellé</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Ex: Syndic de copropriété"
                />
              </div>

              <div>
                <Label className="mb-1.5">Clé technique</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="Ex: syndic_copro"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">Identifiant unique, sans espaces ni accents</p>
              </div>

              <div>
                <Label className="mb-1.5">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Décrivez le contexte métier (optionnel, utilisé pour générer les suggestions IA)..."
                  rows={3}
                />
              </div>

              <div>
                <Label className="mb-1.5">Modules par défaut</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {AVAILABLE_MODULES.map((mod) => (
                    <label key={mod.key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.default_modules.includes(mod.key)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            default_modules: e.target.checked
                              ? [...form.default_modules, mod.key]
                              : form.default_modules.filter((m) => m !== mod.key),
                          })
                        }
                        className="w-4 h-4 rounded border-input"
                      />
                      <span className="text-sm">{mod.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {createSector.isError && (
                <p className="text-sm text-destructive">
                  {createSector.error instanceof Error ? createSector.error.message : "Erreur"}
                </p>
              )}

              <Button
                onClick={handleCreate}
                disabled={!form.key.trim() || !form.label.trim() || createSector.isPending}
                className="w-full"
              >
                {createSector.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Création…</>
                ) : (
                  "Créer le secteur"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  function handleChange(index: number, value: string) {
    const newItems = [...items];
    newItems[index] = value;
    onChange(newItems);
  }

  function handleRemove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function handleAdd() {
    onChange([...items, ""]);
  }

  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</Label>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              value={item}
              onChange={(e) => handleChange(i, e.target.value)}
              className="text-xs h-8"
            />
            <button
              onClick={() => handleRemove(i)}
              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={handleAdd}
          className="text-xs text-primary hover:underline"
        >
          + Ajouter
        </button>
      </div>
    </div>
  );
}
