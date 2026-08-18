const PASSKEY_DEVICE_KEY = "fittlist:passkey-on-this-device";

/**
 * WebAuthn's generic sign-in prompt falls back to a cross-device QR code when
 * this browser has no FittList credential. Only offer that door after this
 * browser has successfully created or used one here.
 */
export function hasLocalPasskeyHistory(): boolean {
  try {
    return window.localStorage.getItem(PASSKEY_DEVICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberLocalPasskey(): void {
  try {
    window.localStorage.setItem(PASSKEY_DEVICE_KEY, "1");
  } catch {
    // Private browsing and embedded browsers may deny storage. Password and
    // magic-link sign-in remain available, so this hint can safely be absent.
  }
}

export function forgetLocalPasskey(): void {
  try {
    window.localStorage.removeItem(PASSKEY_DEVICE_KEY);
  } catch {
    // Nothing else depends on this optional browser hint.
  }
}
