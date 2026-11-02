# iPhone and iPad

OmniChat shares its React interface and agent engine between Android, iOS and web. The agent operates inside OmniChat: it searches saved chats, reads explicitly attached text documents, and prepares document previews. It does not control other applications.

## Use on iPhone without signing

Open the deployed web app in Safari, then choose **Share → Add to Home Screen**. Web requests require a provider that permits CORS. This uses browser storage, not native Keychain storage. The app displays the installation hint on iPhone and iPad.

## Automatic iOS compilation

The regular **Build OmniChat** workflow includes a macOS job that creates the Capacitor iOS project, builds it with Xcode, and uploads **OmniChat-iOS-Simulator**. Its ZIP contains an app for the iOS Simulator; it is **not an IPA that can be installed on an iPhone**.

Native projects are generated during CI. Changes to the privacy manifest and app version are applied by `scripts/configure-ios.rb`. Android and iOS use the same major version of Capacitor.

## Signed device build

The separate manual workflow **Build signed iOS app** produces an IPA after signing secrets are configured. It does not upload to App Store Connect, publish to TestFlight, or change an Apple account.

Configure these GitHub repository secrets:

| Secret | Value |
| --- | --- |
| `APPLE_TEAM_ID` | Apple Developer team identifier |
| `APPLE_CERTIFICATE_BASE64` | Base64-encoded Apple Distribution certificate exported as a `.p12`, including its private key |
| `APPLE_CERTIFICATE_PASSWORD` | Password protecting the `.p12` |
| `APPLE_PROVISION_PROFILE_BASE64` | Base64-encoded distribution `.mobileprovision` profile |
| `IOS_KEYCHAIN_PASSWORD` | A password used only for the temporary CI keychain |

The profile must match `appId` in `capacitor.config.json` (currently `com.omnichat.app`). Choose an identifier registered to your team before provisioning. The profile must include the capabilities required by the app and its plugins.

Select the distribution method when running the workflow:

- **app-store-connect:** App Store distribution profile. The resulting IPA is intended for submission through Apple's distribution tools; it cannot be installed directly as an APK would be. After upload and processing, distribute through TestFlight or App Store review.
- **release-testing:** Ad Hoc distribution profile containing registered device identifiers. Installation is restricted to devices permitted by that profile.

Signing credentials are installed in a temporary keychain and removed in the cleanup step. IPA artifacts are retained for 14 days. The workflow reports missing secrets before attempting a build.

## Local development on macOS

Use an Xcode version compatible with the pinned Capacitor major and the intended deployment target. The default CI compilation runs on `macos-15`.

```bash
npm ci
npm run build:mobile
npm run ios:add
npm run ios:sync
npm run ios:open
```

`ios:add` is needed only once in a checkout. Signing for a real device is configured in Xcode or through the signed workflow.

## Runtime behavior

- Ordinary chat streams using WebView `fetch` when the provider permits it. If a native app encounters a network/CORS fetch failure, eligible JSON endpoints retry through native HTTP; chat then uses a complete response rather than token streaming. A retry can issue a second request if the provider processed the first request but its response was blocked. Native cancellation stops waiting for a result; it does not guarantee cancellation at the provider.
- API keys and provider credentials migrate to secure native storage. Existing plaintext keys are removed only after vault storage succeeds. Browser installations continue to use LocalStorage. Chats and attachments still use LocalStorage; media-heavy storage migration is a separate future step.
- TXT, MD, JSON, CSV and LOG documents up to 64 KB can be attached. They are stored with their message and may be sent to the selected model. The agent's document tool returns at most 20,000 characters per read.
- File drafts, JSON backups and Markdown exports use the native share sheet, including its Save to Files option where available. Draft creation itself does not save or share anything. Temporary exports stay in the app cache until the operating system clears it.
- Agent mode is off by default per conversation and requires a model with OpenAI-compatible tool calling. Each run allows at most six model turns and four tool calls per turn. Agent replies arrive after their tool cycle; ordinary chat retains streaming.
- When the native app enters the background, active requests are stopped rather than presented as guaranteed background jobs. Return to the conversation and retry if necessary.
- No camera, microphone, contacts, calendar, AccessibilityService, or arbitrary system execution is requested by the agent in this version.

CI compilation does not replace testing on an iPhone. Before distribution, verify connection, cancellation, keyboard layout, safe areas, vault restore, app backgrounding, document selection and file export on real devices. A signed build cannot be verified until the required signing secrets are supplied.
