"""AI Documents service — génération de documents via Ollama.

Pipeline pour chaque document :
  1. Extraction du contexte (transcription et/ou dossier préparatoire)
  2. Construction du prompt depuis le template
  3. Appel Ollama en streaming
  4. Sauvegarde progressive + événements SSE
"""

import json
import logging
import os
import queue
import threading
from datetime import datetime, timezone
from typing import Generator

import requests

from app.config import settings

logger = logging.getLogger(__name__)

# File de travaux (un seul job à la fois, comme la transcription)
_job_queue: queue.Queue = queue.Queue()
_worker_started = False
_worker_lock = threading.Lock()


# ── Worker thread ─────────────────────────────────────────────────────────────

def _start_worker():
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        _worker_started = True
        t = threading.Thread(target=_worker_loop, daemon=True)
        t.start()


def _worker_loop():
    while True:
        doc_id = _job_queue.get()
        try:
            _run_generation(doc_id)
        except Exception as exc:
            logger.exception(f"[AI] Erreur inattendue pour le document {doc_id}: {exc}")
        finally:
            _job_queue.task_done()


def enqueue_generation(doc_id: str):
    """Ajoute un job de génération dans la file et démarre le worker si nécessaire."""
    _start_worker()
    _job_queue.put(doc_id)


# ── Extraction du contexte ────────────────────────────────────────────────────

def _extract_transcription_context(session_id: str, db) -> dict:
    """Retourne le texte complet et la durée formatée d'une session de transcription."""
    from app.models.transcription import TranscriptionJob, TranscriptionSegment
    job = db.query(TranscriptionJob).filter_by(id=session_id).first()
    segments = (
        db.query(TranscriptionSegment)
        .filter_by(job_id=session_id)
        .order_by(TranscriptionSegment.start_time)
        .all()
    )
    lines = []
    for seg in segments:
        speaker = f"[{seg.speaker_label}] " if seg.speaker_label else ""
        lines.append(f"{speaker}{seg.text.strip()}")
    text = "\n".join(lines)

    duree = ""
    if job and job.duration_seconds:
        total = int(job.duration_seconds)
        h, rem = divmod(total, 3600)
        m, s = divmod(rem, 60)
        if h:
            duree = f"{h}h{m:02d}min{s:02d}s"
        elif m:
            duree = f"{m}min{s:02d}s"
        else:
            duree = f"{s}s"

    return {"text": text, "duree": duree}


def _extract_dossier_context(dossier_id: str, db) -> dict:
    """Retourne agenda (str) et texte des documents (str) d'un dossier."""
    from app.models.preparatory import PreparatoryDossier, AgendaPoint, DossierDocument
    dossier = db.query(PreparatoryDossier).filter_by(id=dossier_id).first()
    if not dossier:
        return {"agenda": "", "documents_text": "", "title": "", "date": ""}

    # Ordre du jour
    points = (
        db.query(AgendaPoint)
        .filter_by(dossier_id=dossier_id)
        .order_by(AgendaPoint.order_index)
        .all()
    )
    agenda_lines = []
    for i, p in enumerate(points, 1):
        line = f"{i}. {p.title}"
        if p.description:
            line += f" — {p.description}"
        agenda_lines.append(line)
    agenda_str = "\n".join(agenda_lines) if agenda_lines else "(aucun point enregistré)"

    # Texte des documents uploadés
    docs = db.query(DossierDocument).filter_by(dossier_id=dossier_id).all()
    doc_texts = []
    for doc in docs:
        text = _extract_file_text(doc)
        if text:
            doc_texts.append(f"--- {doc.original_filename} ---\n{text}")
    documents_text = "\n\n".join(doc_texts) if doc_texts else "(aucun document fourni)"

    date_str = ""
    if dossier.meeting_date:
        date_str = dossier.meeting_date.strftime("%d/%m/%Y")

    return {
        "agenda": agenda_str,
        "documents_text": documents_text,
        "title": dossier.title,
        "date": date_str,
    }


def _extract_file_text(doc) -> str:
    """Extrait le texte d'un fichier selon son type."""
    file_path = os.path.join(
        settings.prep_docs_path,
        doc.dossier_id,  # stored under dossier_id
        doc.stored_filename,
    )
    if not os.path.exists(file_path):
        return ""

    ct = (doc.content_type or "").lower()
    try:
        if "text" in ct or doc.original_filename.endswith(".txt"):
            with open(file_path, encoding="utf-8", errors="ignore") as f:
                return f.read()[:8000]

        if "docx" in ct or doc.original_filename.endswith(".docx"):
            try:
                import docx
                d = docx.Document(file_path)
                return "\n".join(p.text for p in d.paragraphs if p.text.strip())[:8000]
            except Exception:
                return ""

        if "pdf" in ct or doc.original_filename.endswith(".pdf"):
            try:
                from pdfminer.high_level import extract_text
                return extract_text(file_path)[:8000]
            except Exception:
                return ""
    except Exception as exc:
        logger.warning(f"[AI] Impossible d'extraire le texte de {doc.original_filename}: {exc}")
    return ""


# ── Construction du prompt ────────────────────────────────────────────────────

def _build_prompt(
    template_data: dict,
    context: dict,
) -> tuple[str, str]:
    """Remplace les placeholders du template et retourne (system, user)."""
    builtin = {
        "titre":         context.get("title", ""),
        "date":          context.get("date", ""),
        "organisation":  context.get("organisation", ""),
        "points":        context.get("agenda", ""),
        "transcription": context.get("transcription", ""),
        "documents":     context.get("documents_text", ""),
        "duree":         context.get("duree", ""),
    }
    user_prompt = template_data["user_prompt_template"]
    for key, value in builtin.items():
        user_prompt = user_prompt.replace("{" + key + "}", value or "(non disponible)")

    return template_data["system_prompt"], user_prompt


# ── Map-Reduce pour longs contextes ──────────────────────────────────────────

def _split_transcription(text: str, chunk_size: int, overlap_lines: int = 3) -> list[str]:
    """Découpe la transcription en chunks respectant les sauts de ligne.

    Ajoute un chevauchement de `overlap_lines` lignes entre chaque chunk
    pour préserver le contexte aux frontières.
    """
    chunks = []
    lines = text.split("\n")
    current_chunk: list[str] = []
    current_len = 0

    for line in lines:
        line_len = len(line) + 1  # +1 for \n
        if current_len + line_len > chunk_size and current_chunk:
            chunks.append("\n".join(current_chunk))
            # Garder les dernières lignes comme overlap pour le chunk suivant
            overlap = current_chunk[-overlap_lines:] if overlap_lines > 0 else []
            current_chunk = list(overlap)
            current_len = sum(len(l) + 1 for l in current_chunk)
        current_chunk.append(line)
        current_len += line_len

    if current_chunk:
        chunks.append("\n".join(current_chunk))

    return chunks


def _map_reduce_generate(
    model: str,
    system_prompt: str,
    user_prompt_template: str,
    transcription: str,
    context: dict,
    temperature: float,
    chunk_size: int,
    event_bus,
    doc_id: str,
) -> str:
    """Génère un document en deux passes pour les longs contextes.

    Passe 1 (map) : résume chaque chunk de transcription
    Passe 2 (reduce) : synthèse finale à partir de tous les résumés
    """
    chunks = _split_transcription(transcription, chunk_size)
    logger.info(f"[AI] Map-Reduce: {len(chunks)} chunks de ~{chunk_size} chars")

    # ── Passe 1 : résumer chaque chunk ──
    map_system = (
        "Tu es un assistant qui extrait les points clés d'une transcription de réunion. "
        "Tu produis un résumé COURT en bullet points (5 à 8 points maximum). "
        "RÈGLES :\n"
        "- Chaque point fait UNE phrase maximum\n"
        "- Note les noms des intervenants, les décisions, les chiffres/dates importants\n"
        "- Ne génère JAMAIS de placeholders comme [nom] ou [date]\n"
        "- Sois CONCIS : 400 à 600 caractères maximum pour tout le résumé"
    )

    summaries = []
    for i, chunk in enumerate(chunks):
        event_bus.publish(doc_id, {
            "status": "generating",
            "step": f"map_{i+1}_{len(chunks)}",
            "progress": int((i / len(chunks)) * 80),
        })
        logger.info(f"[AI] Map-Reduce passe 1: chunk {i+1}/{len(chunks)} ({len(chunk)} chars)")

        map_prompt = (
            f"Extrait {i+1}/{len(chunks)} d'une transcription de réunion :\n\n"
            f"{chunk}\n\n"
            "Résume en bullet points courts (5-8 points max, 400-600 caractères max au total)."
        )

        parts = []
        for text in _call_ollama(model, map_system, map_prompt, temperature, num_predict=512, keep_alive="10m"):
            parts.append(text)
        summary = "".join(parts)
        summaries.append(f"[Partie {i+1}/{len(chunks)}]\n{summary}")
        logger.info(f"[AI] Map-Reduce chunk {i+1}: résumé de {len(summary)} chars")

    # ── Passe 2 : synthèse finale ──
    event_bus.publish(doc_id, {
        "status": "generating",
        "step": "reduce",
        "progress": 85,
    })

    combined_summaries = "\n\n".join(summaries)
    logger.info(f"[AI] Map-Reduce passe 2: {len(combined_summaries)} chars de résumés combinés")

    # Construire un prompt reduce dédié qui explique clairement le contexte
    reduce_system = (
        f"{system_prompt}\n\n"
        "CONTEXTE IMPORTANT : La transcription originale était trop longue pour être traitée en une fois. "
        "Elle a été découpée en plusieurs parties, chacune résumée individuellement. "
        "Tu reçois maintenant ces résumés partiels. Tu dois les utiliser pour rédiger le document final "
        "comme si tu avais lu la transcription complète. "
        "RÈGLES :\n"
        "- Utilise UNIQUEMENT les informations présentes dans les résumés\n"
        "- Ne génère JAMAIS de placeholders comme [nom], [date], ... — si une info manque, omets-la\n"
        "- Rédige un document COMPLET et FINALISÉ, prêt à l'emploi"
    )

    # Remplacer {transcription} par les résumés avec un label clair
    reduce_user = user_prompt_template
    builtin = {
        "titre":         context.get("title", ""),
        "date":          context.get("date", ""),
        "organisation":  context.get("organisation", ""),
        "points":        context.get("agenda", ""),
        "transcription": f"(Résumés des {len(chunks)} parties de la transcription)\n\n{combined_summaries}",
        "documents":     context.get("documents_text", ""),
        "duree":         context.get("duree", ""),
    }
    for key, value in builtin.items():
        reduce_user = reduce_user.replace("{" + key + "}", value or "(non disponible)")

    logger.info(f"[AI] Map-Reduce passe 2: user prompt final {len(reduce_user)} chars")

    parts = []
    for text in _call_ollama(model, reduce_system, reduce_user, temperature, num_predict=8192):
        parts.append(text)
    return "".join(parts)


# ── Appel Ollama ──────────────────────────────────────────────────────────────

def _call_ollama(model: str, system_prompt: str, user_prompt: str, temperature: float, num_predict: int = 4096, keep_alive: int | str = 0) -> Generator[str, None, None]:
    """Appelle Ollama en streaming et yield les chunks de texte."""
    payload = {
        "model": model,
        "system": system_prompt,
        "prompt": user_prompt,
        "stream": True,
        "keep_alive": keep_alive,
        "options": {
            "temperature": temperature,
            "num_predict": num_predict,
            "repeat_penalty": 1.3,     # pénalise les répétitions
        },
    }
    url = f"{settings.ollama_url}/api/generate"
    try:
        with requests.post(url, json=payload, stream=True, timeout=600) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    text = chunk.get("response", "")
                    if text:
                        yield text
                    if chunk.get("done"):
                        break
                except json.JSONDecodeError:
                    continue
    except requests.RequestException as exc:
        raise RuntimeError(f"Erreur Ollama : {exc}") from exc


# ── Pipeline principal ────────────────────────────────────────────────────────

def _run_generation(doc_id: str):
    from app.database import SessionLocal
    from app.models.ai_documents import AIDocument
    from app.services.event_bus import event_bus

    db = SessionLocal()
    try:
        doc = db.query(AIDocument).filter_by(id=doc_id).first()
        if not doc:
            logger.error(f"[AI] Document introuvable : {doc_id}")
            return

        # Chargement du snapshot template
        if not doc.template_snapshot:
            logger.error(f"[AI] Pas de snapshot template pour {doc_id}")
            _fail(db, doc, event_bus, "Template introuvable")
            return

        template_data = json.loads(doc.template_snapshot)

        # Mise à jour statut → generating
        doc.status = "generating"
        doc.generation_started_at = datetime.now(timezone.utc)
        db.commit()
        event_bus.publish(doc_id, {"status": "generating", "progress": 0})

        # Extraction du contexte
        context: dict = {}

        if doc.source_session_id:
            event_bus.publish(doc_id, {"status": "generating", "step": "transcription"})
            transcription_ctx = _extract_transcription_context(doc.source_session_id, db)
            context["transcription"] = transcription_ctx["text"]
            context["duree"] = transcription_ctx["duree"]

        if doc.source_dossier_id:
            event_bus.publish(doc_id, {"status": "generating", "step": "dossier"})
            dossier_ctx = _extract_dossier_context(doc.source_dossier_id, db)
            context.update(dossier_ctx)

        # Extra context injected at creation time (e.g. from procedure convocation)
        if doc.extra_context:
            try:
                context.update(json.loads(doc.extra_context))
            except Exception:
                pass

        # Nom de la collectivité depuis le tenant
        from app.models.tenant import Tenant
        tenant = db.query(Tenant).filter_by(id=doc.tenant_id).first()
        context["organisation"] = tenant.name if tenant else ""
        context.setdefault("title", doc.title)

        # Construction du prompt
        system_prompt, user_prompt = _build_prompt(template_data, context)

        from app.services.ai_config import get_model_for_usage
        base_model = template_data.get("ollama_model") or get_model_for_usage("ai_documents")
        temperature = float(template_data.get("temperature", 0.3))

        # Sélection auto : si le user prompt dépasse le seuil, utiliser le modèle long contexte
        model = base_model
        if (len(user_prompt) > settings.ollama_long_context_threshold
                and settings.ollama_long_context_model):
            model = settings.ollama_long_context_model
            logger.info(f"[AI] Context trop long ({len(user_prompt)} chars > {settings.ollama_long_context_threshold}), "
                        f"bascule vers modèle long contexte: {model}")

        # Génération
        logger.info(f"[AI] Model: {model}, Temperature: {temperature}")
        logger.info(f"[AI] System prompt ({len(system_prompt)} chars): {system_prompt[:200]}...")
        logger.info(f"[AI] User prompt ({len(user_prompt)} chars): {user_prompt[:300]}...")

        # Map-Reduce si activé et contexte long
        transcription_text = context.get("transcription", "")
        use_map_reduce = (
            settings.ollama_map_reduce
            and len(user_prompt) > settings.ollama_long_context_threshold
            and len(transcription_text) > settings.ollama_map_reduce_chunk_size
        )

        if use_map_reduce:
            logger.info(f"[AI] Mode Map-Reduce activé (transcription: {len(transcription_text)} chars)")
            event_bus.publish(doc_id, {"status": "generating", "step": "map_reduce"})
            result_text = _map_reduce_generate(
                model=model,
                system_prompt=system_prompt,
                user_prompt_template=template_data["user_prompt_template"],
                transcription=transcription_text,
                context=context,
                temperature=temperature,
                chunk_size=settings.ollama_map_reduce_chunk_size,
                event_bus=event_bus,
                doc_id=doc_id,
            )
        else:
            event_bus.publish(doc_id, {"status": "generating", "step": "llm"})
            result_parts = []
            for chunk in _call_ollama(model, system_prompt, user_prompt, temperature):
                result_parts.append(chunk)
                if sum(len(p) for p in result_parts) % 200 < len(chunk):
                    event_bus.publish(doc_id, {
                        "status": "generating",
                        "partial": "".join(result_parts[-5:]),
                    })
            result_text = "".join(result_parts)
        doc.status = "completed"
        doc.result_text = result_text
        doc.generation_completed_at = datetime.now(timezone.utc)
        db.commit()
        event_bus.publish(doc_id, {"status": "completed"})
        logger.info(f"[AI] Document {doc_id} généré ({len(result_text)} chars)")

        # Indexation RAG automatique
        try:
            from app.services.indexer import index_ai_document
            index_ai_document(doc.tenant_id, doc.id, doc.title, result_text)
        except Exception as exc:
            logger.warning(f"[AI] Indexation RAG échouée pour {doc_id}: {exc}")

    except Exception as exc:
        logger.exception(f"[AI] Erreur génération {doc_id}: {exc}")
        try:
            doc = db.query(AIDocument).filter_by(id=doc_id).first()
            if doc:
                _fail(db, doc, event_bus, str(exc))
        except Exception:
            pass
    finally:
        db.close()


def _fail(db, doc, event_bus, message: str):
    doc.status = "error"
    doc.error_message = message
    doc.generation_completed_at = datetime.now(timezone.utc)
    db.commit()
    event_bus.publish(doc.id, {"status": "error", "error": message})


# ── Templates par défaut ──────────────────────────────────────────────────────

DEFAULT_TEMPLATES = [
    {
        "name": "Procès-verbal",
        "description": "PV complet d'une séance à partir de la transcription et de l'ordre du jour",
        "document_type": "pv",
        "system_prompt": (
            "Tu es un rédacteur spécialisé dans la rédaction de procès-verbaux de réunions. "
            "Tu rédiges des documents clairs, formels et précis en français."
        ),
        "user_prompt_template": (
            "Rédige le procès-verbal de la séance suivante.\n\n"
            "Organisation : {organisation}\n"
            "Date : {date}\n"
            "Titre : {titre}\n\n"
            "ORDRE DU JOUR :\n{points}\n\n"
            "TRANSCRIPTION DE LA SÉANCE :\n{transcription}\n\n"
            "Rédige un procès-verbal complet et structuré, en respectant l'ordre du jour. "
            "Pour chaque point, résume les discussions et les décisions prises."
        ),
        "temperature": 0.3,
    },
    {
        "name": "Résumé exécutif",
        "description": "Synthèse courte et structurée d'une séance",
        "document_type": "summary",
        "system_prompt": (
            "Tu es un assistant spécialisé dans la rédaction de synthèses de réunions en français. "
            "Tu rédiges des résumés concis, clairs et structurés."
        ),
        "user_prompt_template": (
            "Rédige un résumé exécutif de la réunion suivante.\n\n"
            "Organisation : {organisation}\n"
            "Date : {date}\n"
            "Points abordés : {points}\n\n"
            "TRANSCRIPTION :\n{transcription}\n\n"
            "Produis un résumé en bullet points (5 à 10 points maximum), "
            "en mettant en avant les décisions prises et les points importants abordés."
        ),
        "temperature": 0.4,
    },
    {
        "name": "Compte-rendu de réunion",
        "description": "Compte-rendu structuré à partir de la transcription et des documents fournis",
        "document_type": "custom",
        "system_prompt": (
            "Tu es un assistant spécialisé dans la rédaction de comptes-rendus de réunions en français. "
            "Tu rédiges des documents structurés, fidèles aux échanges et accessibles."
        ),
        "user_prompt_template": (
            "Rédige un compte-rendu de la réunion suivante.\n\n"
            "Organisation : {organisation}\n"
            "Date : {date}\n"
            "Titre : {titre}\n\n"
            "ORDRE DU JOUR :\n{points}\n\n"
            "TRANSCRIPTION :\n{transcription}\n\n"
            "DOCUMENTS FOURNIS :\n{documents}\n\n"
            "Rédige un compte-rendu clair et structuré par point à l'ordre du jour. "
            "Indique les participants, les échanges principaux et les décisions ou actions à suivre."
        ),
        "temperature": 0.3,
    },
]


def seed_default_templates(tenant_id: str, db) -> None:
    """Crée les templates par défaut pour un tenant s'il n'en a pas."""
    from app.models.ai_documents import AIDocumentTemplate
    existing = db.query(AIDocumentTemplate).filter_by(tenant_id=tenant_id).count()
    if existing > 0:
        return
    for tpl in DEFAULT_TEMPLATES:
        db.add(AIDocumentTemplate(tenant_id=tenant_id, **tpl))
    db.commit()
    logger.info(f"[AI] Templates par défaut créés pour tenant {tenant_id}")
