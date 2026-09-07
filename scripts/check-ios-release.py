#!/usr/bin/env python3
"""Fail closed before Xcode packages a development/preview native shell."""
import json
import os
from pathlib import Path
import plistlib
import sys

ROOT = Path(__file__).resolve().parents[1]


def validate(config, info, privacy, environment):
    errors = []
    server = config.get("server", {})
    if server.get("url", "").rstrip("/") != "https://www.fittlist.co":
        errors.append("Release server must be the canonical HTTPS production origin, without a path or query")
    if set(server.get("allowNavigation", [])) - {"fittlist.co", "www.fittlist.co"}:
        errors.append("Release navigation must not trust preview or wildcard hosts")
    if server.get("cleartext") is not False:
        errors.append("Release cleartext traffic must be disabled")
    if server.get("errorPath") != "offline.html":
        errors.append("The bundled offline recovery page is required")
    if config.get("loggingBehavior") != "none" or config.get("ios", {}).get("webContentsDebuggingEnabled") is not False:
        errors.append("Release logging and Web Inspector must be disabled")
    if config.get("appId") != "co.fittlist.app" or config.get("appName") != "FittList":
        errors.append("Native app identity does not match FittList")
    if "UISupportedInterfaceOrientations~ipad" in info:
        errors.append("Remove the iPad orientation configuration")
    if info.get("UISupportedInterfaceOrientations") != ["UIInterfaceOrientationPortrait"]:
        errors.append("The iPhone release must use portrait orientation")
    if info.get("NSAppTransportSecurity", {}).get("NSAllowsArbitraryLoads"):
        errors.append("Release ATS must not allow arbitrary insecure traffic")
    reasons = {row["NSPrivacyAccessedAPIType"]: row.get("NSPrivacyAccessedAPITypeReasons", []) for row in privacy.get("NSPrivacyAccessedAPITypes", [])}
    if "C617.1" not in reasons.get("NSPrivacyAccessedAPICategoryFileTimestamp", []):
        errors.append("Declare sandbox file timestamps used by the share cache")
    if environment.get("TARGETED_DEVICE_FAMILY", "1") != "1":
        errors.append("TARGETED_DEVICE_FAMILY must be 1 (iPhone)")
    if environment.get("CAPACITOR_DEBUG", "false").lower() not in ("false", "no", "0", ""):
        errors.append("CAPACITOR_DEBUG must be disabled for Release")
    return errors


def main():
    if os.environ.get("CONFIGURATION") == "Debug":
        print("Native release gate: Debug build; development configuration permitted")
        return 0
    try:
        config = json.loads((ROOT / "ios/App/App/capacitor.config.json").read_text())
        info = plistlib.loads((ROOT / "ios/App/App/Info.plist").read_bytes())
        privacy = plistlib.loads((ROOT / "ios/App/App/PrivacyInfo.xcprivacy").read_bytes())
        errors = validate(config, info, privacy, os.environ)
        if not (ROOT / "ios/App/App/public/offline.html").is_file():
            errors.append("Run npm run ios:sync to include the bundled recovery page")
    except (OSError, ValueError, KeyError):
        errors = ["Native configuration is missing or invalid; run npm run ios:sync"]
    for error in errors:
        print(f"error: {error}", file=sys.stderr)
    if not errors:
        print("Native release gate: production origin, iPhone-only configuration, recovery and privacy verified")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
