"""Email service — SMTP-based email sending with Outlook-compatible templates."""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Base template — table-based, Outlook-safe, responsive
# ---------------------------------------------------------------------------

_PRIMARY = "#2563eb"
_SUCCESS = "#16a34a"
_DANGER = "#dc2626"
_TEXT = "#1f2937"
_MUTED = "#6b7280"
_LIGHT = "#f3f4f6"
_BORDER = "#e5e7eb"
_WHITE = "#ffffff"


def _base_template(content: str, footer_extra: str = "") -> str:
    """Wrap *content* in the shared email shell.

    Rules for Outlook compatibility:
    - All layout via <table> (no div flex/grid)
    - All styles inline
    - Width via attributes, not CSS
    - VML buttons for Outlook via <!--[if mso]> conditionals
    """
    return f"""\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ScribIA</title>
  <!--[if mso]>
  <style type="text/css">
    table {{border-collapse: collapse;}}
    .button-link {{padding: 0 !important;}}
  </style>
  <![endif]-->
</head>
<body style="margin:0; padding:0; background-color:{_LIGHT}; font-family:Arial,Helvetica,sans-serif; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:{_LIGHT};">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <!-- Card -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
               style="max-width:560px; width:100%; background-color:{_WHITE}; border:1px solid {_BORDER}; border-radius:8px;">

          <!-- Header bar -->
          <tr>
            <td style="background-color:{_PRIMARY}; padding:20px 32px; border-radius:8px 8px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color:{_WHITE}; font-size:20px; font-weight:bold; letter-spacing:0.5px;">
                    ScribIA
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px 32px; color:{_TEXT}; font-size:15px; line-height:24px;">
              {content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid {_BORDER}; padding-top:16px; font-size:12px; color:{_MUTED}; line-height:18px;">
                    {footer_extra}
                    Ce message a été envoyé par ScribIA. Si vous n'êtes pas concerné(e), vous pouvez ignorer cet email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>"""


def _button(url: str, label: str, color: str) -> str:
    """Render a CTA button that works in Outlook (VML fallback) and all other clients."""
    return f"""\
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
             xmlns:w="urn:schemas-microsoft-com:office:word"
             href="{url}" style="height:44px;v-text-anchor:middle;width:180px;"
             arcsize="14%" strokecolor="{color}" fillcolor="{color}">
  <w:anchorlock/>
  <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">
    {label}
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="{url}" target="_blank"
   style="display:inline-block; background-color:{color}; color:{_WHITE};
          padding:12px 28px; text-decoration:none; border-radius:6px;
          font-size:14px; font-weight:bold; font-family:Arial,sans-serif;
          mso-hide:all;">
  {label}
</a>
<!--<![endif]-->"""


# ---------------------------------------------------------------------------
# Public email functions
# ---------------------------------------------------------------------------

def send_consent_email(
    to_email: str,
    to_name: str,
    token: str,
    organisation: str = "votre organisation",
) -> bool:
    """Send a consent request email with accept/refuse links."""
    base_url = settings.app_base_url.rstrip("/")
    accept_url = f"{base_url}/consent-response?token={token}&action=accept"
    refuse_url = f"{base_url}/consent-response?token={token}&action=refuse"

    subject = f"Demande de consentement — {organisation}"

    accept_btn = _button(accept_url, "J'accepte", _SUCCESS)
    refuse_btn = _button(refuse_url, "Je refuse", _DANGER)

    content = f"""\
<p style="margin:0 0 16px 0; font-size:16px; font-weight:bold; color:{_TEXT};">
  Demande de consentement
</p>
<p style="margin:0 0 12px 0;">Bonjour {to_name},</p>
<p style="margin:0 0 12px 0;">
  Dans le cadre d'une réunion organisée par <strong>{organisation}</strong>,
  nous souhaitons procéder à un enregistrement audio à des fins de
  transcription et de génération de comptes rendus.
</p>
<p style="margin:0 0 20px 0;">
  Conformément au RGPD, nous avons besoin de votre <strong>consentement
  explicite</strong> avant de procéder à cet enregistrement.
</p>

<!-- Buttons -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding-right:12px;">
      {accept_btn}
    </td>
    <td>
      {refuse_btn}
    </td>
  </tr>
</table>"""

    footer = (
        "Vous pouvez retirer votre consentement à tout moment en utilisant "
        "le lien de retrait qui vous sera communiqué après acceptation.<br/><br/>"
    )

    html_body = _base_template(content, footer_extra=footer)
    return _send_email(to_email, subject, html_body)


def send_withdrawal_confirmation(to_email: str, to_name: str) -> bool:
    """Send a confirmation that consent has been withdrawn."""
    subject = "Confirmation de retrait de consentement — ScribIA"

    content = f"""\
<p style="margin:0 0 16px 0; font-size:16px; font-weight:bold; color:{_TEXT};">
  Retrait de consentement confirmé
</p>
<p style="margin:0 0 12px 0;">Bonjour {to_name},</p>
<p style="margin:0 0 12px 0;">
  Votre retrait de consentement a bien été enregistré.
</p>
<p style="margin:0 0 0 0;">
  Vos données vocales associées ont été supprimées ou anonymisées
  conformément à notre politique de protection des données.
</p>"""

    footer = (
        "Si vous n'êtes pas à l'origine de cette demande, "
        "contactez votre administrateur.<br/><br/>"
    )

    html_body = _base_template(content, footer_extra=footer)
    return _send_email(to_email, subject, html_body)


def send_generic_email(
    to_email: str,
    subject: str,
    body_html: str,
) -> bool:
    """Send a generic email using the shared template.

    *body_html* is raw HTML that will be placed inside the card body.
    Useful for procedure step emails, notifications, etc.
    """
    html_body = _base_template(body_html)
    return _send_email(to_email, subject, html_body)


# ---------------------------------------------------------------------------
# Low-level SMTP transport
# ---------------------------------------------------------------------------

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
