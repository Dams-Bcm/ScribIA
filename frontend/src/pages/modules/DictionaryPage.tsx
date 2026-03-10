import { useState, useRef } from "react";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Eye,
  Search,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useDictionaryRules,
  useDictionaryCategories,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  usePreviewSubstitutions,
  useImportRules,
} from "@/api/hooks/useDictionary";
import type { SubstitutionRule, SubstitutionRuleCreate } from "@/api/types";

export function DictionaryPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [editingRule, setEditingRule] = useState<SubstitutionRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: rules = [], isLoading } = useDictionaryRules(selectedCategory);
  const { data: categories = [] } = useDictionaryCategories();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const preview = usePreviewSubstitutions();
  const importRules = useImportRules();

  // Form state
  const [form, setForm] = useState<SubstitutionRuleCreate>({
    original: "",
    replacement: "",
    is_case_sensitive: true,
    is_whole_word: true,
    is_enabled: true,
    category: null,
  });

  const filteredRules = rules.filter(
    (r) =>
      !search ||
      r.original.toLowerCase().includes(search.toLowerCase()) ||
      r.replacement.toLowerCase().includes(search.toLowerCase()),
  );

  function openCreate() {
    setEditingRule(null);
    setForm({ original: "", replacement: "", is_case_sensitive: true, is_whole_word: true, is_enabled: true, category: null });
    setShowForm(true);
  }

  function openEdit(rule: SubstitutionRule) {
    setEditingRule(rule);
    setForm({
      original: rule.original,
      replacement: rule.replacement,
      is_case_sensitive: rule.is_case_sensitive,
      is_whole_word: rule.is_whole_word,
      is_enabled: rule.is_enabled,
      category: rule.category,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingRule) {
      await updateRule.mutateAsync({ id: editingRule.id, data: form });
    } else {
      await createRule.mutateAsync(form);
    }
    setShowForm(false);
  }

  async function handleToggle(rule: SubstitutionRule) {
    await updateRule.mutateAsync({ id: rule.id, data: { is_enabled: !rule.is_enabled } });
  }

  function handleDelete(rule: SubstitutionRule) {
    confirm({
      title: `Supprimer la règle "${rule.original}" → "${rule.replacement}" ?`,
      confirmLabel: "Supprimer",
      onConfirm: () => deleteRule.mutate(rule.id),
    });
  }

  async function handlePreview() {
    if (!previewText.trim()) return;
    await preview.mutateAsync(previewText);
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      const parsed: SubstitutionRuleCreate[] = [];
      for (const line of lines) {
        const parts = line.split(";");
        if (parts.length >= 2) {
          parsed.push({
            original: parts[0]!.trim(),
            replacement: parts[1]!.trim(),
            is_case_sensitive: parts[2]?.trim().toLowerCase() !== "false",
            is_whole_word: parts[3]?.trim().toLowerCase() !== "false",
            category: parts[4]?.trim() || null,
          });
        }
      }
      if (parsed.length > 0) {
        await importRules.mutateAsync(parsed);
        setShowImport(false);
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Dictionnaire</h1>
      <p className="text-muted-foreground mb-6">
        Regles de substitution automatique pour corriger les transcriptions et documents
      </p>

      {/* Actions bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Nouvelle regle
        </Button>
        <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
          <Eye className="w-4 h-4 mr-1" /> Apercu
        </Button>
        <Button variant="outline" onClick={() => setShowImport(!showImport)}>
          <Upload className="w-4 h-4 mr-1" /> Importer CSV
        </Button>

        <div className="flex-1" />

        {/* Category filter */}
        <Select value={selectedCategory ?? ""} onValueChange={(v) => setSelectedCategory(v === "__all__" ? undefined : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Toutes les categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Toutes les categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher..."
            className="border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm bg-background w-48"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Import CSV panel */}
      {showImport && (
        <div className="bg-background rounded-xl border border-border p-4 mb-4">
          <h3 className="font-semibold mb-2">Importer un fichier CSV</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Format : <code>original;remplacement;sensible_casse;mot_entier;categorie</code>
            <br />
            Les 3 derniers champs sont optionnels.
          </p>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileImport} />
          {importRules.isPending && <p className="text-sm mt-2">Import en cours...</p>}
          {importRules.isSuccess && (
            <p className="text-sm text-green-600 mt-2">Import reussi !</p>
          )}
        </div>
      )}

      {/* Preview panel */}
      {showPreview && (
        <div className="bg-background rounded-xl border border-border p-4 mb-4">
          <h3 className="font-semibold mb-2">Apercu des substitutions</h3>
          <textarea
            className="w-full border border-border rounded-lg p-3 text-sm bg-background min-h-[80px] mb-2"
            placeholder="Collez un texte pour tester les substitutions..."
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
          />
          <Button size="sm" onClick={handlePreview} disabled={preview.isPending}>
            Tester
          </Button>
          {preview.data && (
            <div className="mt-3 space-y-2">
              <p className="text-sm">
                <strong>{preview.data.rules_applied}</strong> regle(s) appliquee(s)
              </p>
              <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">
                {preview.data.substituted_text}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit form */}
      {showForm && (
        <div className="bg-background rounded-xl border border-border p-4 mb-4">
          <h3 className="font-semibold mb-3">
            {editingRule ? "Modifier la regle" : "Nouvelle regle"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Mot/expression original</label>
                <input
                  type="text"
                  required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background mt-1"
                  value={form.original}
                  onChange={(e) => setForm({ ...form, original: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Remplacement</label>
                <input
                  type="text"
                  required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background mt-1"
                  value={form.replacement}
                  onChange={(e) => setForm({ ...form, replacement: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">Categorie (optionnel)</label>
                <input
                  type="text"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background mt-1"
                  placeholder="ex: noms propres, acronymes..."
                  value={form.category ?? ""}
                  onChange={(e) => setForm({ ...form, category: e.target.value || null })}
                  list="categories-list"
                />
                <datalist id="categories-list">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer mt-auto pb-2">
                <Checkbox
                  checked={form.is_case_sensitive}
                  onCheckedChange={(checked) => setForm({ ...form, is_case_sensitive: !!checked })}
                />
                Sensible a la casse
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer mt-auto pb-2">
                <Checkbox
                  checked={form.is_whole_word}
                  onCheckedChange={(checked) => setForm({ ...form, is_whole_word: !!checked })}
                />
                Mot entier uniquement
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createRule.isPending || updateRule.isPending}>
                {editingRule ? "Modifier" : "Creer"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Rules table */}
      <div className="bg-background rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Chargement...</div>
        ) : filteredRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Aucune regle de substitution</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Ajoutez des regles pour corriger automatiquement les mots mal transcrits
            </p>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" /> Nouvelle regle
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium">Original</th>
                <th className="text-left px-4 py-2.5 font-medium">Remplacement</th>
                <th className="text-left px-4 py-2.5 font-medium">Categorie</th>
                <th className="text-center px-4 py-2.5 font-medium">Options</th>
                <th className="text-center px-4 py-2.5 font-medium">Utilisations</th>
                <th className="text-center px-4 py-2.5 font-medium">Actif</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-mono">{rule.original}</td>
                  <td className="px-4 py-2.5 font-mono">{rule.replacement}</td>
                  <td className="px-4 py-2.5">
                    {rule.category && (
                      <span className="inline-block px-2 py-0.5 bg-muted rounded text-xs">
                        {rule.category}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {rule.is_case_sensitive && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded" title="Sensible a la casse">
                          Aa
                        </span>
                      )}
                      {rule.is_whole_word && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded" title="Mot entier">
                          [w]
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">
                    {rule.usage_count}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => handleToggle(rule)} className="text-muted-foreground hover:text-foreground">
                      {rule.is_enabled ? (
                        <ToggleRight className="w-5 h-5 text-green-600" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(rule)}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule)}
                        className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmDialog}
      {/* Stats */}
      {filteredRules.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {filteredRules.length} regle(s) — {filteredRules.filter((r) => r.is_enabled).length} active(s)
        </p>
      )}
    </div>
  );
}
