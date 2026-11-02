# OmniChat

OmniChat is a mobile-first, local-first chat client for OpenAI-compatible APIs. One interface supports streaming text, image generation, text-to-speech, and video generation.

## Highlights

- Pure black UI with responsive mobile navigation
- English and Persian typography using Inter and Vazirmatn
- Automatic model classification for text, image, audio, and video
- Searchable and filterable model library
- Streaming Markdown with GitHub Flavored Markdown
- Request cancellation, timeout handling, retry, copy, download, and delete controls
- Automatic right-to-left direction for Persian and Arabic messages
- Configurable system prompt, temperature, voice, and image size
- LocalStorage persistence with JSON backup and restore
- Capacitor 6 Android and iOS packaging
- Optional agent mode: search saved chats, read selected text documents, and prepare file drafts
- Agent activity log, cancellation and a six-step execution limit
- Native secure storage for API keys, with migration from existing settings
- Native share sheet for document drafts, JSON backups and Markdown exports
- GitHub Actions builds for Web, GitHub Pages, Android APK, and iOS Simulator

## Mobile agent

Choose a text model, enable **Agent mode** above the composer, and ask it to work with saved conversations or an attached text document. Tools require an OpenAI-compatible model supporting function calls. For example: “Find my conversations about travel and prepare a Markdown summary.”

Use **Attach text file** for TXT, MD, JSON, CSV or LOG documents up to 64 KB. The agent can read the attachment and prepare a file preview; tap **Save / Share** yourself to export it. It can access saved conversation text when agent mode is enabled. Requested text goes to your chosen provider. It cannot operate other apps or run system commands.

## iPhone / iPad

- **Web app:** open the deployed app in Safari and choose **Share → Add to Home Screen**. This requires an API provider allowing browser CORS.
- **Native build:** the main workflow compiles an iOS Simulator app on macOS. A separate manual workflow exports a signed IPA after Apple signing secrets are configured.
- **Distribution:** the simulator artifact is not installable on a real iPhone. TestFlight/App Store and Ad Hoc builds need appropriate Apple signing and provisioning.

See [iOS build and distribution instructions](docs/IOS.md), including the exact signing secrets.

## API compatibility

OmniChat calls these endpoints:

| Mode | Endpoint |
| --- | --- |
| Models | `GET /v1/models` |
| Text | `POST /v1/chat/completions` |
| Image | `POST /v1/images/generations` |
| Audio | `POST /v1/audio/speech` |
| Video | `POST /v1/video/generations` |

Authentication, when a key is provided:

```http
Authorization: Bearer YOUR_API_KEY
```

The provider must permit browser requests through CORS for the GitHub Pages build. Android WebView requests also depend on the provider's TLS and network policy.

Video APIs are less standardized than the other endpoints. OmniChat supports direct URL, base64, and binary video responses. When the initial response contains a job ID, it also polls `GET /v1/video/generations/{id}` for up to five minutes. Providers using a different status endpoint need a small adapter in `src/hooks/useApi.js`.

## GitHub setup and build

1. Push this directory to the root of a GitHub repository.
2. Open **Settings → Pages** and select **GitHub Actions** as the source.
3. Push to `main`.
4. Open the repository’s **Actions** tab and select the latest **Build OmniChat** run.

The workflow produces:

- `OmniChat-Web` artifact
- `OmniChat-APK` artifact containing `OmniChat-debug.apk`
- `OmniChat-iOS-Simulator` artifact for Apple's simulator
- A GitHub Pages deployment from `main`

To publish the APK as a GitHub Release asset, create and push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The tagged workflow creates release notes and attaches `OmniChat-debug.apk`.

## Local development

Local installation is optional; GitHub Actions performs the official builds.

```bash
npm ci
npm run dev
```

Production web build:

```bash
npm run build
```

Android project:

```bash
npm run build:android
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

Requirements for Android builds are Node.js 22 and Java 17.

## GitHub Pages base path

The default Vite base is `/repo-name/`, matching the requested configuration. In GitHub Actions, `VITE_BASE_PATH` automatically changes it to the actual repository name. Capacitor builds use the relative base `./`.

## Privacy and storage

There is no OmniChat backend, user account, or analytics service. Chats and settings use LocalStorage. Native iOS/Android builds store API credentials in secure device storage and migrate existing keys before clearing their plaintext copies. The web app still stores API keys in browser storage. Prompts and any document or conversation text requested by the agent are sent to the selected model provider.

Large base64 media can exceed LocalStorage quotas. OmniChat shows a warning when persistence fails; download important generated media and export backups regularly.

## Important production note

The workflow creates a debug APK so it can build without signing secrets. For Play Store or public production distribution, configure an Android signing keystore in GitHub Secrets and add an `assembleRelease` signing step.
