"""Email service — SMTP-based email sending with Outlook-compatible templates."""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Design tokens
# ---------------------------------------------------------------------------

_PRIMARY = "#2563eb"
_SUCCESS = "#16a34a"
_DANGER = "#dc2626"
_TEXT = "#1f2937"
_TEXT_SECONDARY = "#374151"
_MUTED = "#9ca3af"
_BG = "#f0f2f5"
_WHITE = "#ffffff"
_BORDER = "#e5e7eb"

# ---------------------------------------------------------------------------
# Template building blocks (table-based, Outlook-safe)
# ---------------------------------------------------------------------------


def _button_filled(url: str, label: str, color: str) -> str:
    """Solid CTA button with VML fallback for Outlook desktop."""
    return f"""\
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
             xmlns:w="urn:schemas-microsoft-com:office:word"
             href="{url}" style="height:44px;v-text-anchor:middle;width:200px;"
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
          padding:12px 36px; text-decoration:none; border-radius:6px;
          font-size:14px; font-weight:bold; font-family:Arial,sans-serif;
          mso-hide:all;">
  {label}
</a>
<!--<![endif]-->"""


def _button_outline(url: str, label: str, color: str = _MUTED) -> str:
    """Ghost/outline CTA button — less prominent."""
    return f"""\
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
             xmlns:w="urn:schemas-microsoft-com:office:word"
             href="{url}" style="height:44px;v-text-anchor:middle;width:200px;"
             arcsize="14%" strokecolor="#d1d5db" fillcolor="#ffffff">
  <w:anchorlock/>
  <center style="color:{color};font-family:Arial,sans-serif;font-size:14px;">
    {label}
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="{url}" target="_blank"
   style="display:inline-block; background-color:{_WHITE}; color:{color};
          padding:11px 36px; text-decoration:none; border-radius:6px;
          font-size:14px; font-family:Arial,sans-serif;
          border:1px solid #d1d5db;
          mso-hide:all;">
  {label}
</a>
<!--<![endif]-->"""


def _info_box(text: str, bg: str = "#f8fafc", border: str = "#e2e8f0",
              color: str = "#475569") -> str:
    """Colored info/callout box."""
    return f"""\
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:{bg}; border:1px solid {border}; border-radius:8px;">
  <tr>
    <td style="padding:14px 18px; font-size:13px; color:{color}; line-height:20px;">
      {text}
    </td>
  </tr>
</table>"""


def _base_template(icon: str, title: str, content: str,
                   footer_extra: str = "", icon_bg: str = "#eff6ff") -> str:
    """Wrap content in the shared email shell.

    - Table-based layout (no div flex/grid)
    - All styles inline
    - VML conditionals for Outlook
    - Max 580px, 100% on mobile
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
<body style="margin:0; padding:0; background-color:{_BG}; font-family:Arial,Helvetica,sans-serif; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:{_BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Card -->
        <table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0"
               style="max-width:580px; width:100%; background-color:{_WHITE}; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <!-- Accent line -->
          <tr>
            <td style="height:4px; background:linear-gradient(90deg, #2563eb, #7c3aed); font-size:0; line-height:0;">
              <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:4px; background-color:{_PRIMARY};">&nbsp;</td></tr></table><![endif]-->
              &nbsp;
            </td>
          </tr>

          <!-- Logo -->
          <tr>
            <td style="padding:28px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:36px; height:36px; background-color:{_PRIMARY}; border-radius:8px; text-align:center; vertical-align:middle;" width="36" height="36">
                    <span style="color:{_WHITE}; font-size:18px; font-weight:bold; line-height:36px;">S</span>
                  </td>
                  <td style="padding-left:12px;">
                    <span style="font-size:20px; font-weight:bold; color:{_TEXT}; letter-spacing:-0.3px;">ScribIA</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:20px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid {_BORDER}; font-size:0; line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Title with icon -->
          <tr>
            <td style="padding:24px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:40px; height:40px; background-color:{icon_bg}; border-radius:10px; text-align:center; vertical-align:middle;" width="40" height="40">
                    <span style="font-size:20px; line-height:40px;">{icon}</span>
                  </td>
                  <td style="padding-left:14px;">
                    <span style="font-size:18px; font-weight:bold; color:{_TEXT};">{title}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:20px 40px 0 40px; color:{_TEXT_SECONDARY}; font-size:15px; line-height:26px;">
              {content}
            </td>
          </tr>

          <!-- Spacer -->
          <tr><td style="height:28px; font-size:0; line-height:0;">&nbsp;</td></tr>

          <!-- Footer divider -->
          <tr>
            <td style="padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid {_BORDER}; font-size:0; line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 40px 24px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:12px; color:{_MUTED}; line-height:18px;">
                    {footer_extra}
                    Ce message a été envoyé par ScribIA. Si vous n'êtes pas concerné(e),
                    vous pouvez ignorer cet email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>"""


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

    accept_btn = _button_filled(accept_url, "Accepter", _SUCCESS)
    refuse_btn = _button_outline(refuse_url, "Refuser", "#6b7280")

    info = _info_box(
        '<span style="font-weight:600; color:#334155;">Ce que cela implique :</span><br/>'
        "Votre voix sera enregistrée, transcrite puis utilisée pour générer "
        "un compte rendu. Vous pouvez retirer votre consentement à tout moment."
    )

    content = f"""\
<p style="margin:0 0 14px 0;">Bonjour <strong>{to_name}</strong>,</p>
<p style="margin:0 0 14px 0;">
  Dans le cadre d'une réunion organisée par <strong>{organisation}</strong>,
  nous souhaitons procéder à un enregistrement audio à des fins de
  transcription et de génération de comptes rendus.
</p>
<p style="margin:0 0 20px 0;">
  Conformément au RGPD, nous avons besoin de votre <strong>consentement
  explicite</strong> avant de procéder.
</p>

{info}

<!-- Buttons -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
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
        "Vous pouvez retirer votre consentement à tout moment via le lien "
        "qui vous sera communiqué après acceptation.<br/><br/>"
    )

    html_body = _base_template(
        icon="&#128274;", title="Demande de consentement",
        content=content, footer_extra=footer, icon_bg="#eff6ff",
    )
    return _send_email(to_email, subject, html_body)


def send_withdrawal_confirmation(to_email: str, to_name: str) -> bool:
    """Send a confirmation that consent has been withdrawn."""
    subject = "Confirmation de retrait de consentement — ScribIA"

    info = _info_box(
        '<span style="font-weight:600;">Aucune action requise de votre part.</span><br/>'
        "Ce message est une simple confirmation. Vous n'avez rien d'autre à faire.",
        bg="#f0fdf4", border="#bbf7d0", color="#166534",
    )

    content = f"""\
<p style="margin:0 0 14px 0;">Bonjour <strong>{to_name}</strong>,</p>
<p style="margin:0 0 14px 0;">
  Votre retrait de consentement a bien été enregistré.
</p>
<p style="margin:0 0 20px 0;">
  Vos données vocales associées ont été <strong>supprimées ou anonymisées</strong>
  conformément à notre politique de protection des données.
</p>

{info}"""

    footer = (
        "Si vous n'êtes pas à l'origine de cette demande, "
        "contactez votre administrateur.<br/><br/>"
    )

    html_body = _base_template(
        icon="&#9989;", title="Retrait confirmé",
        content=content, footer_extra=footer, icon_bg="#f0fdf4",
    )
    return _send_email(to_email, subject, html_body)


def send_generic_email(
    to_email: str,
    subject: str,
    body_html: str,
    title: str = "",
    icon: str = "&#9889;",
    icon_bg: str = "#eff6ff",
) -> bool:
    """Send a generic email using the shared template.

    *body_html* is raw HTML placed inside the card body.
    Useful for procedure step emails, notifications, test SMTP, etc.
    """
    html_body = _base_template(
        icon=icon, title=title or subject,
        content=body_html, icon_bg=icon_bg,
    )
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
