---
name: solitaire-device-deploy
description: Build, install, and launch the Better Solitaire iOS app on a connected iPhone or iPad. Use for requests to run, build, reinstall, or deploy this repository's app on a physical Apple device.
---

# Deploy Solitaire to a device

Run the bundled helper from the repository root:

```bash
.agents/skills/solitaire-device-deploy/scripts/deploy.sh [iphone|ipad|device-name|device-id]
```

The helper discovers paired available devices, syncs Capacitor, performs an incremental signed Debug build, installs the app, and launches `dev.ehutt.solitaire`. If exactly one device is available, omit the argument.

Run the helper with host access because CoreDevice and code signing do not work inside the filesystem sandbox. One invocation replaces separate discovery, build, install, and launch tool calls.

If launch reports that the profile has not been explicitly trusted, the install succeeded. Tell the user to trust the developer under `Settings > General > VPN & Device Management`, then open Solitaire. Do not rebuild.

Do not clean DerivedData. The shared cache makes repeat builds fast. Do not clear app or WebView data because that removes saved games and settings.
