# Better Solitaire

- This is a Capacitor iOS app whose UI and game logic live primarily in `www/index.html`.
- Edit files under `www/`, not the generated copy under `ios/App/App/public/`; run `npm run sync` after web changes.
- Native iOS configuration lives under `ios/App/App/`. Build from `ios/App/App.xcodeproj` with the `App` scheme.
- Preserve the app's saved game/settings when diagnosing issues; do not clear simulator or WebView data unless explicitly asked.
- Verify UI changes in both portrait and landscape on an iPhone simulator. Landscape must account for safe-area/notch insets, the side control rail, and unusually long tableau piles.
- Simulator screenshots taken while landscape may be stored with portrait pixel orientation; rotate the image for inspection rather than mistaking that for an app-layout bug.
- A successful JavaScript parse does not catch runtime layout errors. After changes, launch the app and confirm a full deal renders, New starts another deal, and controls remain responsive.
