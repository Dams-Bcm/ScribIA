"""Email service — SMTP-based email sending for consent requests."""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings

logger = logging.getLogger(__name__)


def send_consent_email(
    to_email: str,
    to_name: str,
    token: str,
    organisation: str = "votre organisation",
) -> bool:
    """Send a consent request email with accept/refuse/withdraw links.

    Returns True if sent successfully, False otherwise.
    """
    base_url = settings.app_base_url.rstrip("/")
    accept_url = f"{base_url}/consent-response?token={token}&action=accept"
    refuse_url = f"{base_url}/consent-response?token={token}&action=refuse"

    subject = f"Demande de consentement à l'enregistrement — {organisation}"

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Demande de consentement</h2>
      <p>Bonjour {to_name},</p>
      <p>
        Dans le cadre d'une réunion organisée par <strong>{organisation}</strong>,
        nous souhaitons procéder à un enregistrement audio à des fins de
        transcription et de génération de comptes rendus.
      </p>
      <p>
        Conformément au RGPD, nous avons besoin de votre consentement explicite
        avant de procéder à cet enregistrement.
      </p>
      <p style="margin: 24px 0;">
        <a href="{accept_url}"
           style="background: #16a34a; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 6px; margin-right: 12px;">
          J'accepte
        </a>
        <a href="{refuse_url}"
           style="background: #dc2626; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 6px;">
          Je refuse
        </a>
      </p>
      <p style="font-size: 12px; color: #666;">
        Vous pouvez retirer votre consentement à tout moment en utilisant le
        lien de retrait qui vous sera communiqué après acceptation.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="font-size: 11px; color: #999;">
        Ce message a été envoyé par ScribIA. Si vous n'êtes pas concerné(e),
        vous pouvez ignorer cet email.
      </p>
    </body>
    </html>
    """

    return _send_email(to_email, subject, html_body)


def send_withdrawal_confirmation(to_email: str, to_name: str) -> bool:
    """Send a confirmation that consent has been withdrawn."""
    subject = "Confirmation de retrait de consentement — ScribIA"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Retrait de consentement confirmé</h2>
      <p>Bonjour {to_name},</p>
      <p>
        Votre retrait de consentement a bien été enregistré.
        Vos données vocales associées ont été supprimées ou anonymisées
        conformément à notre politique de protection des données.
      </p>
      <p style="font-size: 12px; color: #666;">
        Si vous n'êtes pas à l'origine de cette demande, contactez votre administrateur.
      </p>
    </body>
    </html>
    """
    return _send_email(to_email, subject, html_body)


def _send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Low-level SMTP send. Returns True on success."""
    if not settings.smtp_host:
        logger.warning(f"[EMAIL] SMTP not configured — email to {to_email} skipped")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)

        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)

        server.sendmail(settings.smtp_from_email, [to_email], msg.as_string())
        server.quit()
        logger.info(f"[EMAIL] Sent to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.error(f"[EMAIL] Failed to send to {to_email}: {e}")
        return False
