"""Generate VAPID keys for Web Push notifications.

Run this once, then add the output to your .env file:
  SCRIBIA_VAPID_PRIVATE_KEY=...
  SCRIBIA_VAPID_PUBLIC_KEY=...
"""

from py_vapid import Vapid

vapid = Vapid()
vapid.generate_keys()

print("Add these to your .env file:\n")
print(f"SCRIBIA_VAPID_PRIVATE_KEY={vapid.private_pem().decode().strip()}")
print(f"SCRIBIA_VAPID_PUBLIC_KEY={vapid.public_key_urlsafe_base64()}")
