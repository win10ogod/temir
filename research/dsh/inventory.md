# DeepSeek Harness 套件清單（自動產生）

來源：`references/deepseek-harness@f3803c96`，以 `scripts/dsh_inventory.py` 產生，請勿手改。
共 388 個套件。LOC＝`src/` 下非測試 `.ts` 的行數。

「本專案狀態」欄由 [`feature-matrix.md`](feature-matrix.md) 維護。

## apps（10）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `apps/cli` | `@deepseek-ai/dsh` | dsh CLI: profile launch, plugin management, and configuration inspection | 1024 |
| `apps/desktop` | `@deepseek-ai/dsh-desktop` | Electron desktop shell for a bundled dsh runtime and external plugins | 10237 |
| `apps/desktop-host` | `@deepseek-ai/dsh-desktop-host` | Private Node-mode host process for the Electron desktop application | 598 |
| `apps/plugin-market-generator` | `@deepseek-ai/dsh-plugin-market-generator` | Reference generator of plugin market index files from a list of npm packages and Git repositories | 1359 |
| `apps/web` | `@deepseek-ai/dsh-web-frontend` | Web application entry: vite build over the @deepseek-ai/dsh-client-web shell library; dist/ served by apps/cli's dsh web | 66 |
| `apps/web/tests/fixtures/plugins/fixture-bundle` | `@fixture/bundle` | Registry description for the fixture bundle. | 0 |
| `apps/web/tests/fixtures/plugins/fixture-icon-skin` | `@fixture/icon-skin` |  | 0 |
| `apps/web/tests/fixtures/plugins/fixture-input-extension` | `@fixture/input-extension` |  | 0 |
| `apps/web/tests/fixtures/plugins/fixture-layout-bottom` | `@fixture/layout-bottom` |  | 0 |
| `apps/web/tests/fixtures/plugins/fixture-live-client` | `@fixture/live-client` |  | 0 |

## packages/acp（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/acp/acp` | `@deepseek-ai/dsh-acp` | Automation-only Agent Client Protocol server for driving DeepSeek Harness agents over JSON-RPC stdio | 1781 |

## packages/api（10）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/api/account-controller` | `@deepseek-ai/dsh-api-account-controller` | Expose safe account operations over authenticated Remote | 123 |
| `packages/api/gateway` | `@deepseek-ai/dsh-api-gateway` | Typert Remote Host dispatcher and Client API endpoint | 5691 |
| `packages/api/job-controller` | `@deepseek-ai/dsh-api-job-controller` | Job Remote observation stream and the reference-counted client job-output service | 994 |
| `packages/api/remote-access` | `@deepseek-ai/dsh-api-remote-access` | Method-level Remote access control for non-owner Peers and the per-Peer access snapshot | 1073 |
| `packages/api/remotes` | `@deepseek-ai/dsh-api-remotes` | Remote BFF assembly for application-selected Host capabilities | 457 |
| `packages/api/session-controller` | `@deepseek-ai/dsh-api-session-controller` | Session Remote commands, cold reads, and live control transport | 9218 |
| `packages/api/settings-controller` | `@deepseek-ai/dsh-api-settings-controller` | Remote owner for the configuration surfaces over the settings-domain seams | 460 |
| `packages/api/terminal-controller` | `@deepseek-ai/dsh-api-terminal-controller` | Session-owned interactive terminals with shell discovery, screen recovery and typed Remote control | 1976 |
| `packages/api/workspace-controller` | `@deepseek-ai/dsh-api-workspace-controller` | Workspace Remote commands and reconnect-safe state transport | 1960 |
| `packages/api/workspace-files` | `@deepseek-ai/dsh-api-workspace-files` | Workspace file service and Client resource provider: bounded reads, directory listing, and live metadata over the workspaceFiles Remote namespace | 1386 |

## packages/attachment（2）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/attachment/attachment` | `@deepseek-ai/dsh-attachment` | Durable immutable attachment storage seam for the DeepSeek Harness | 711 |
| `packages/attachment/attachment-local` | `@deepseek-ai/dsh-attachment-local` | Private content-addressed DSH_HOME attachment storage | 1556 |

## packages/boot（6）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/boot/app-boot` | `@deepseek-ai/dsh-app-boot` | Shared boot glue for the app bins: .env loading, fail-loud Loader guards, snapshot-aware config resolution, and the Loader boot sequence | 5416 |
| `packages/boot/cmdline` | `@deepseek-ai/dsh-cmdline` | Immutable command-line handoff from a dsh launcher to any app plugin that injects cmdlineArgs | 239 |
| `packages/boot/config-editor` | `@deepseek-ai/dsh-config-editor` | Persist plugin configuration through profile patches and Loader reconciliation | 156 |
| `packages/boot/hmr` | `@deepseek-ai/dsh-hmr` | Coordinated module and profile configuration hot reload | 1735 |
| `packages/boot/plugin-manager` | `@deepseek-ai/dsh-plugin-manager` | Current-profile plugin and bundle management shared by dsh CLI, Web and agent tools | 3630 |
| `packages/boot/plugin-market` | `@deepseek-ai/dsh-plugin-market` | Configured plugin market indexes for the Web Discover page and the plugin_market agent tool | 1818 |

## packages/browser-use（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/browser-use/browser-use` | `@deepseek-ai/dsh-browser-use` | Exclusive named browser-use provider registration | 63 |

## packages/bundle（6）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/bundle/acp-app` | `@deepseek-ai/dsh-acp-app` | The dsh ACP profile bundle: automation-only JSON-RPC stdio and process lifecycle over dsh-base | 48 |
| `packages/bundle/base` | `@deepseek-ai/dsh-base` | The shared dsh core as a profile bundle: the first patch layer of base-backed profiles, inserting core rows over the empty profile root | 9 |
| `packages/bundle/headless` | `@deepseek-ai/dsh-headless` | The dsh one-shot bundle: a direct core Agent/Session runner over dsh-base with no Host, HTTP, or browser layer | 992 |
| `packages/bundle/sdk-app` | `@deepseek-ai/dsh-sdk-app` | The dsh SDK profile bundle: stdio JSON-RPC serving and process lifecycle over dsh-base | 62 |
| `packages/bundle/sdk-minimal` | `@deepseek-ai/dsh-sdk-minimal` | The standalone minimal SDK profile bundle: JSON-RPC, one DeepSeek adapter, persistent shell, and JSONL sessions | 9 |
| `packages/bundle/web-app` | `@deepseek-ai/dsh-web-app` | The dsh browser-surface bundle: the web patch layer over dsh-base plus the runtime glue plugin (frontend dist serving, bash runtime variables, URL line) | 424 |

## packages/client（67）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/client/connection` | `@deepseek-ai/dsh-client-connection` | Authenticated RPC transport and generation lifecycle | 2751 |
| `packages/client/file-upload` | `@deepseek-ai/dsh-client-file-upload` | Agent-scoped browser file upload, streaming intake, and staged receipt service | 975 |
| `packages/client/hmr` | `@deepseek-ai/dsh-client-hmr` | Web client graph synchronization and rebuilt-bundle reload transport | 345 |
| `packages/client/locale` | `@deepseek-ai/dsh-client-locale` | Locale plugin: Host-backed preference, extensible language catalog, browser fallback, and typed built-in dictionaries | 1207 |
| `packages/client/modules` | `@deepseek-ai/dsh-client-modules` | Client module system, dual-face: node half composes the __DSH_BOOT__ entry graph (incremental dsh.client scan, bundle route, index tap, webPlugins service); browser half is the lazy-CJS module table the vendored cordis Loader consumes as its internal seam | 2809 |
| `packages/client/product-analytics` | `@deepseek-ai/dsh-client-product-analytics` | Desktop product event collection and authenticated Host reporting | 495 |
| `packages/client/resources` | `@deepseek-ai/dsh-client-resources` | Unified client resource model: protocol-registered providers turn URL addresses into live values, consumed through the useResource global standard hook | 371 |
| `packages/client/shortcuts` | `@deepseek-ai/dsh-client-shortcuts` | Application keyboard command registry and physical-key routing | 1245 |
| `packages/client/store` | `@deepseek-ai/dsh-client-store` | React-free observable and snapshot-store contracts with the shared Zustand/Immer engine | 393 |
| `packages/client/ui-agent-preset` | `@deepseek-ai/dsh-client-ui-agent-preset` | Agent-preset surfaces: the default for later sessions, this session's seat, and the composition editor | 1823 |
| `packages/client/ui-approval` | `@deepseek-ai/dsh-client-ui-approval` | Approval composer takeover over the scoped Remote Event waterfall | 434 |
| `packages/client/ui-attachment` | `@deepseek-ai/dsh-client-ui-attachment` | Dynamic attachment presentation plugin for conversation input, message-image, and trajectory image slots | 218 |
| `packages/client/ui-brand-official` | `@deepseek-ai/dsh-client-ui-brand-official` | Official DeepSeek Harness brand occupants for the Web client's sidebar slots | 30 |
| `packages/client/ui-chat` | `@deepseek-ai/dsh-client-ui-chat` | Chat Conversation target, node definitions, renderers, and details surface | 12175 |
| `packages/client/ui-commands` | `@deepseek-ai/dsh-client-ui-commands` | Client command surface: global directory cache, '/' source, three command UI kinds, popupSelect registry | 1694 |
| `packages/client/ui-conversation` | `@deepseek-ai/dsh-client-ui-conversation` | Target-neutral Conversation assembly, shell, composer, queue, and view navigation | 14067 |
| `packages/client/ui-deliverables` | `@deepseek-ai/dsh-client-ui-deliverables` | Changed-files card with per-file comparison tabs, delivery cards, and clickable final-response file references for Web | 1841 |
| `packages/client/ui-directory-picker-browse` | `@deepseek-ai/dsh-client-ui-directory-picker-browse` | In-app directory browsing surface: the workspace directory-flow owner rendering the host's listing and creation primitives | 238 |
| `packages/client/ui-directory-picker-native` | `@deepseek-ai/dsh-client-ui-directory-picker-native` | Native directory-picker surface: the renderless workspace directory-flow occupant driving the local Desktop or Host OS chooser | 117 |
| `packages/client/ui-dockkit` | `@deepseek-ai/dsh-client-ui-dockkit` | Docking layout kit: split-tree engine with invertible operations, and the React components that render and drive it (zero cordis) | 2982 |
| `packages/client/ui-entry-customization` | `@deepseek-ai/dsh-client-ui-entry-customization` | Customize plugin entries in the left sidebar, conversation views, and right sidebar, and quickly create new plugins. | 139 |
| `packages/client/ui-file-drag` | `@deepseek-ai/dsh-client-ui-file-drag` | Application-owned file drag transfers and localized failure feedback | 248 |
| `packages/client/ui-goal` | `@deepseek-ai/dsh-client-ui-goal` | Session goal surface: GoalBar docked above the composer, read from the goal session projection | 611 |
| `packages/client/ui-input-trigger` | `@deepseek-ai/dsh-client-ui-input-trigger` | Input trigger pipeline: '/' and '@' detection, candidate menu, pick routing to registered sources | 1610 |
| `packages/client/ui-jobs` | `@deepseek-ai/dsh-client-ui-jobs` | Session-header background-job list with on-demand streaming record panels | 421 |
| `packages/client/ui-layout` | `@deepseek-ai/dsh-client-ui-layout` | Shell plugin: three-column AppFrame with drag handles, ctx.layout viewing-state service (navigation + panels) | 676 |
| `packages/client/ui-message-feedback` | `@deepseek-ai/dsh-client-ui-message-feedback` | The Web feedback surface: per-message Like/Dislike in the assistant-message action strip and the feedback dialog behind both ratings and /feedback, backed by the messageFeedback and sessionFeedback Host Remotes | 931 |
| `packages/client/ui-model-selection` | `@deepseek-ai/dsh-client-ui-model-selection` | Model selection over the shared model catalog, Session projection, and session.selectModel | 909 |
| `packages/client/ui-open-in-app` | `@deepseek-ai/dsh-client-ui-open-in-app` | Web "Open In..." controls: the Session-header split button opening the workspace directory in an installed application, and the document preview's default-application controls for one file | 705 |
| `packages/client/ui-permission-presets` | `@deepseek-ai/dsh-client-ui-permission-presets` | Permission surfaces: a new-session default in General settings and a current-session /permission popup over the permissions projection | 923 |
| `packages/client/ui-plan` | `@deepseek-ai/dsh-client-ui-plan` | Plan mode controls, persistent transcript plan cards, and sidebar Markdown previews | 572 |
| `packages/client/ui-plugin-manager` | `@deepseek-ai/dsh-client-ui-plugin-manager` | Plugin management for the dsh web client: the sidebar Plugins panel installs, enables, disables, retries, and composes installed plugin packages | 4952 |
| `packages/client/ui-plugin-market` | `@deepseek-ai/dsh-client-ui-plugin-market` | Discover tab of the dsh web Plugins page: browse configured plugin market indexes and install their bundles | 1324 |
| `packages/client/ui-primitives` | `@deepseek-ai/dsh-client-ui-primitives` | Pure React atoms for the dsh web UI: controls, icons, markdown, and JSON inspectors (zero cordis) | 4476 |
| `packages/client/ui-reference` | `@deepseek-ai/dsh-client-ui-reference` | Unified Web @file and @session reference source | 529 |
| `packages/client/ui-renderer` | `@deepseek-ai/dsh-client-ui-renderer` | Browser UI renderer: React slot bindings, ctx.uiRenderer, and the assembled application root | 896 |
| `packages/client/ui-schedule` | `@deepseek-ai/dsh-client-ui-schedule` | Host task management page and Session reminder catalog | 4554 |
| `packages/client/ui-secret-mask` | `@deepseek-ai/dsh-client-ui-secret-mask` | Web display masking for recognized credentials in sent user text | 840 |
| `packages/client/ui-session` | `@deepseek-ai/dsh-client-ui-session` | Session Controller adapter for React and session-scoped slots | 743 |
| `packages/client/ui-settings` | `@deepseek-ai/dsh-client-ui-settings` | Settings domain base plugin: shared configuration forms and the canonical settings slot-type contract | 1055 |
| `packages/client/ui-settings-account` | `@deepseek-ai/dsh-client-ui-settings-account` | Manage DeepSeek login and open Platform billing pages | 2139 |
| `packages/client/ui-settings-agent-loop` | `@deepseek-ai/dsh-client-ui-settings-agent-loop` | Settings page of the agent loop on the dsh web client's Plugins page: the parallel tool-call cap of the agent-loop namespace | 269 |
| `packages/client/ui-settings-general` | `@deepseek-ai/dsh-client-ui-settings-general` | Settings ownerless-copy and product onboarding plugin: the General section, shell trigger/header chrome content, settings dictionaries, and the versioned welcome notice | 945 |
| `packages/client/ui-settings-models` | `@deepseek-ai/dsh-client-ui-settings-models` | Models settings and shared product-onboarding dialogs over existing settings and credential joins | 2257 |
| `packages/client/ui-settings-plugin-inventory` | `@deepseek-ai/dsh-client-ui-settings-plugin-inventory` | Read-only Cordis Loader inventory tab in Web Plugins settings | 400 |
| `packages/client/ui-settings-plugins` | `@deepseek-ai/dsh-client-ui-settings-plugins` | Built-in plugins settings section for the dsh web client: the Settings navigation entry and the tab chrome feature-owned tabs register into | 172 |
| `packages/client/ui-settings-session-log` | `@deepseek-ai/dsh-client-ui-settings-session-log` | General settings control for Session-log upload with DeepSeek API requests | 158 |
| `packages/client/ui-settings-shell` | `@deepseek-ai/dsh-client-ui-settings-shell` | Settings page of the shell executor on the dsh web client's Plugins page: the command timeout and the per-stream output cap of the shell namespace | 293 |
| `packages/client/ui-settings-subagent` | `@deepseek-ai/dsh-client-ui-settings-subagent` | Settings page of Subagent delegation on the dsh web client's Plugins page: recursion depth, parallel capacity, and the models agents may choose for subagents | 948 |
| `packages/client/ui-settings-web-search` | `@deepseek-ai/dsh-client-ui-settings-web-search` | Settings page of the DeepSeek web-search provider on the dsh web client's Plugins page: its API key, endpoint, and per-request search budget | 721 |
| `packages/client/ui-shortcuts` | `@deepseek-ai/dsh-client-ui-shortcuts` | Keyboard shortcut reference, recording, and local preference editing | 455 |
| `packages/client/ui-sidebar` | `@deepseek-ai/dsh-client-ui-sidebar` | Sidebar plugin: session multi-level tree, search, grouping, state dots | 435 |
| `packages/client/ui-sidebar-browser` | `@deepseek-ai/dsh-client-ui-sidebar-browser` | Sandboxed Web browser tabs for the right Sidebar | 1633 |
| `packages/client/ui-sidebar-documentpreview` | `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` | Extensible Sidebar previews for Office documents, spreadsheets, Markdown, code, images, PDF, HTML, and plain text | 4471 |
| `packages/client/ui-sidebar-files` | `@deepseek-ai/dsh-client-ui-sidebar-files` | Workspace file tree tab type for the right Sidebar: lazy directory listing over the workspaceFiles Remote namespace, opening files into the Sidebar | 864 |
| `packages/client/ui-sidebar-right` | `@deepseek-ai/dsh-client-ui-sidebar-right` | Right Sidebar: the docking surface's session-bound state, its panel and header expand control, and the navigation service over it | 3556 |
| `packages/client/ui-sidebar-terminal` | `@deepseek-ai/dsh-client-ui-sidebar-terminal` | Interactive shell tabs for the right Sidebar | 490 |
| `packages/client/ui-skill` | `@deepseek-ai/dsh-client-ui-skill` | Web skill references and the dedicated skill tool row | 412 |
| `packages/client/ui-slots` | `@deepseek-ai/dsh-client-ui-slots` | Slot registry pure core: typed ordinary Slots and reusable Component Factories, derived props, Store seats, and renderer installation | 1976 |
| `packages/client/ui-subagent` | `@deepseek-ai/dsh-client-ui-subagent` | Subagent conversation catalog, continuation routing UI, and '@' reference source | 479 |
| `packages/client/ui-theme` | `@deepseek-ai/dsh-client-ui-theme` | Theme plugin: Host bootstrap for the pre-plugin palette; ThemeRuntime for light/dark/system state and icon replacements; --dsw-* token styles and Appearance settings row | 1380 |
| `packages/client/ui-tool` | `@deepseek-ai/dsh-client-ui-tool` | Client Tool call-tree renderer and keyed per-tool presentation slot | 2769 |
| `packages/client/ui-trajectory` | `@deepseek-ai/dsh-client-ui-trajectory` | Trajectory event ledger and timing overview with live tool-result inspection | 5612 |
| `packages/client/ui-user-questions` | `@deepseek-ai/dsh-client-ui-user-questions` | Web ask_user_question composer takeover and plan-review presentation UI | 1624 |
| `packages/client/ui-workflow-run` | `@deepseek-ai/dsh-client-ui-workflow-run` | Durable workflow-run Conversation Node and nested member disclosure for dsh web | 422 |
| `packages/client/ui-workspace` | `@deepseek-ai/dsh-client-ui-workspace` | Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots | 3644 |
| `packages/client/web` | `@deepseek-ai/dsh-client-web` | Web boot kernel: static module table, Cordis loader, framework-free boot page, and UI-renderer handoff | 818 |

## packages/compaction（5）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/compaction/command-compact` | `@deepseek-ai/dsh-command-compact` | Human-facing slash command for explicit session compaction | 108 |
| `packages/compaction/compaction` | `@deepseek-ai/dsh-compaction` | Abstract compaction service seam (ctx.compaction) for the DeepSeek Harness | 505 |
| `packages/compaction/compaction-basic` | `@deepseek-ai/dsh-compaction-basic` | Token-meter-driven compaction policy and LLM summarization backend for the DeepSeek Harness | 1739 |
| `packages/compaction/compaction-image-offload` | `@deepseek-ai/dsh-compaction-image-offload` | Durable image offload for image-capable routes: replace over-budget request images with placeholders and retry | 197 |
| `packages/compaction/compaction-tool-result-pruner` | `@deepseek-ai/dsh-compaction-tool-result-pruner` | Replay-safe model-free head/middle/tail pruning for tool-result surface nodes | 303 |

## packages/computer-use（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/computer-use/computer-use` | `@deepseek-ai/dsh-computer-use` | Exclusive named computer-use provider registration | 63 |

## packages/context（7）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/context/agent-instructions` | `@deepseek-ai/dsh-agent-instructions` | Workspace context loader for AGENTS.md/CLAUDE.md instruction files | 2114 |
| `packages/context/file-reference` | `@deepseek-ai/dsh-file-reference` | File-reference discovery contract and shared @file grammar | 113 |
| `packages/context/file-reference-local` | `@deepseek-ai/dsh-file-reference-local` | Local-filesystem ctx.fileReferences provider with bounded fuzzy indexes | 531 |
| `packages/context/harness-dev-context` | `@deepseek-ai/dsh-harness-dev-context` | Model context naming the DeepSeek Harness checkout and Web GUI URL without letting either change the system prompt | 158 |
| `packages/context/session-reference` | `@deepseek-ai/dsh-session-reference` | Cross-session snapshot references and durable untrusted model context (ctx.sessionReferenceResolver) | 990 |
| `packages/context/time-context` | `@deepseek-ai/dsh-time-context` | Durable per-step context with the current time and elapsed time | 377 |
| `packages/context/tmux-context` | `@deepseek-ai/dsh-tmux-context` | Opt-in durable per-step context with this agent's tmux pane and window location | 272 |

## packages/core（10）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/core/agent` | `@deepseek-ai/dsh-agent` | Agent interface, registry, initiator scope, and event vocabulary for the DeepSeek Harness | 1824 |
| `packages/core/agent-default-model` | `@deepseek-ai/dsh-agent-default-model` | Default model selection shared by Agent entry points | 97 |
| `packages/core/agent-loop` | `@deepseek-ai/dsh-agent-loop` | The concrete agent loop plugin for the DeepSeek Harness | 2130 |
| `packages/core/agent-tool-presentation` | `@deepseek-ai/dsh-agent-tool-presentation` | Deprecated tool presentation selector; use dsh-tool-executor-native or dsh-tool-executor-ptc directly | 54 |
| `packages/core/scope` | `@deepseek-ai/dsh-scope` | Scoped-context registration primitive (scope tags, scope-filtered event dispatch) for the DeepSeek Harness | 471 |
| `packages/core/session` | `@deepseek-ai/dsh-session` | Event-sourced session store for the DeepSeek Harness | 3353 |
| `packages/core/system-prompt` | `@deepseek-ai/dsh-system-prompt` | System prompt assembly registry for the DeepSeek Harness | 697 |
| `packages/core/tool-executor-native` | `@deepseek-ai/dsh-tool-executor-native` | Native tool execution plugin | 35 |
| `packages/core/tool-executor-ptc` | `@deepseek-ai/dsh-tool-executor-ptc` | PTC program execution, tool bindings, and generated SDK prompts | 2207 |
| `packages/core/tools` | `@deepseek-ai/dsh-tools` | Tool registry and execution pipeline for the DeepSeek Harness | 3710 |

## packages/credentials（5）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/credentials/authorization` | `@deepseek-ai/dsh-authorization` | Authorization seam (ctx.authorization): plugin-owned flows that obtain a credential through a conversation with the human | 541 |
| `packages/credentials/credentials` | `@deepseek-ai/dsh-credentials` | Abstract credential seam (ctx.credentials): settings carry references to secrets, providers own the values | 408 |
| `packages/credentials/credentials-local` | `@deepseek-ai/dsh-credentials-local` | File-backed credentials provider ($DSH_HOME/.env under the live process environment) for the DeepSeek Harness | 916 |
| `packages/credentials/deepseek-account` | `@deepseek-ai/dsh-deepseek-account` | Read account state and resolve official API credentials | 308 |
| `packages/credentials/deepseek-account-platform` | `@deepseek-ai/dsh-deepseek-account-platform` | Authorize DeepSeek accounts through browser PKCE | 1080 |

## packages/deliverables（3）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/deliverables/deliverable-file-references` | `@deepseek-ai/dsh-deliverable-file-references` | Shared model guidance for file links and deliverables across DeepSeek Harness hosts | 30 |
| `packages/deliverables/tool-present` | `@deepseek-ai/dsh-tool-present` | Explicit workspace file delivery declarations for the DeepSeek Harness | 127 |
| `packages/deliverables/workspace-changes` | `@deepseek-ai/dsh-workspace-changes` | Per-turn workspace file changes recorded from git working-tree snapshots and whole-file captures, with per-file comparisons, for the DeepSeek Harness | 1289 |

## packages/document（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/document/office-to-pdf` | `@deepseek-ai/dsh-office-to-pdf` | Shared Office-to-PDF conversion with bounded queues and caching | 656 |

## packages/experimental（65）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/experimental/action-cards` | `@deepseek-ai/dsh-action-cards` | Optional action cards below answers: one shared proposal tool, card state, user actions and status notices | 654 |
| `packages/experimental/agent-team` | `@deepseek-ai/dsh-experimental-agent-team` | Implicit-root Agent Teams roster, direct peer messaging, and shared task DAG | 2172 |
| `packages/experimental/agent-team-profile` | `@deepseek-ai/dsh-experimental-agent-team-profile` | Agent Teams collaboration, tools, and Web UI in one experimental bundle | 8 |
| `packages/experimental/api-speech-to-text` | `@deepseek-ai/dsh-experimental-api-speech-to-text` | Authenticated experimental speech transcription for browser clients | 136 |
| `packages/experimental/auto-review` | `@deepseek-ai/dsh-experimental-auto-review` | Per-tool LLM authorization review for the DeepSeek Harness Auto permission preset | 863 |
| `packages/experimental/badge-skill-bundle` | `@deepseek-ai/dsh-experimental-badge-skill-bundle` | Let agents add a “powered by dsh” badge to documents, pull requests, and other outputs. | 2 |
| `packages/experimental/browser-use-chrome-devtools-mcp` | `@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp` | Experimental per-Session Chromium browser tools through chrome-devtools-mcp | 43 |
| `packages/experimental/browser-use-playwright-mcp` | `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp` | Experimental per-Session Chromium browser tools through @playwright/mcp | 51 |
| `packages/experimental/browser-use-runtime` | `@deepseek-ai/dsh-experimental-browser-use-runtime` | Session-owned browser resource lifecycles and MCP integration for experimental providers | 417 |
| `packages/experimental/browser-use-stagehand-native` | `@deepseek-ai/dsh-experimental-browser-use-stagehand-native` | Experimental Stagehand browser tools with separately configured native models | 647 |
| `packages/experimental/claude-code-mods` | `@deepseek-ai/dsh-experimental-claude-code-mods` | Experimental bridge: load Claude Code mods (hooks modules) and run their hook chains on DeepSeek Harness extension points | 3809 |
| `packages/experimental/client-ui-action-cards` | `@deepseek-ai/dsh-client-ui-action-cards` | Action cards below completed answers: the shared card frame, kind bodies and the compact tool row | 270 |
| `packages/experimental/client-ui-agent-team` | `@deepseek-ai/dsh-experimental-client-ui-agent-team` | Web Agent Teams roster, task board, and teammate navigation | 322 |
| `packages/experimental/client-ui-claude-code-mods` | `@deepseek-ai/dsh-experimental-client-ui-claude-code-mods` | Web band above the prompt for Claude Code mods: draws each session's mod tree and sends button presses back to the bridge | 224 |
| `packages/experimental/client-ui-cot-translation` | `@deepseek-ai/dsh-experimental-client-ui-cot-translation` | Optional machine translation of expanded reasoning, preserving original Session text | 633 |
| `packages/experimental/client-ui-creation-recommendations` | `@deepseek-ai/dsh-client-ui-creation-recommendations` | Body of the personalized page card: location choice, creation progress, Keep, Undo and Restore | 457 |
| `packages/experimental/client-ui-forge` | `@deepseek-ai/dsh-experimental-client-ui-forge` | Sidebar panel for a Session's change requests, with a worktree option for new Sessions and its Host Remote | 6252 |
| `packages/experimental/client-ui-plugin-recommendations` | `@deepseek-ai/dsh-client-ui-plugin-recommendations` | Official plugin card body with catalog text and enabling | 300 |
| `packages/experimental/client-ui-stats` | `@deepseek-ai/dsh-experimental-client-ui-stats` | Per-turn and per-step context, timing, cache, and tool-cost table contributed as an experimental conversation View | 4049 |
| `packages/experimental/client-ui-voice-input` | `@deepseek-ai/dsh-experimental-client-ui-voice-input` | Record speech and insert editable text into the conversation draft | 1192 |
| `packages/experimental/computer-use-cua-driver-mcp` | `@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp` | Experimental computer use through an installed Cua Driver MCP executable | 71 |
| `packages/experimental/computer-use-cua-driver-native` | `@deepseek-ai/dsh-experimental-computer-use-cua-driver-native` | Experimental computer-use provider embedding the Cua Driver native npm SDK | 138 |
| `packages/experimental/cot-translation-bundle` | `@deepseek-ai/dsh-experimental-cot-translation-bundle` | Experimental machine translation of expanded reasoning | 2 |
| `packages/experimental/creation-recommendations` | `@deepseek-ai/dsh-creation-recommendations` | Create persistent removable interface plugins from explicit conversation needs | 546 |
| `packages/experimental/cua` | `@deepseek-ai/dsh-cua` | Shared Computer Use application objects, authorization, and logged tool execution | 2672 |
| `packages/experimental/cua-bundle` | `@deepseek-ai/dsh-cua-bundle` | Optional macOS Computer Use and permission setup | 2 |
| `packages/experimental/cua-macos` | `@deepseek-ai/dsh-experimental-cua-macos` | macOS native provider for shared Computer Use application and window objects | 508 |
| `packages/experimental/forge` | `@deepseek-ai/dsh-experimental-forge` | Provider-neutral change request registry with shared status polling | 709 |
| `packages/experimental/forge-bundle` | `@deepseek-ai/dsh-experimental-forge-bundle` | Experimental change request panel and worktree option for Sessions in Git repositories | 2 |
| `packages/experimental/forge-github` | `@deepseek-ai/dsh-experimental-forge-github` | GitHub provider for the experimental forge registry, read through the GitHub CLI on the host | 803 |
| `packages/experimental/forge-session` | `@deepseek-ai/dsh-experimental-forge-session` | Binds change requests to the Session that created, pushed, or tracked them | 860 |
| `packages/experimental/hook-protocol` | `@deepseek-ai/dsh-hook-protocol` | Shared Claude Code / Codex hook wire protocol: matcher engine, stdin/exit-code/stdout codec, multi-hook merge, and hook/* session events | 748 |
| `packages/experimental/hooks-claude-code` | `@deepseek-ai/dsh-hooks-claude-code` | Bridge plugin: run a Claude Code hooks.json / settings hook config on the DeepSeek Harness interception seams | 488 |
| `packages/experimental/hooks-codex` | `@deepseek-ai/dsh-hooks-codex` | Bridge plugin: run a Codex hooks.json hook config on the DeepSeek Harness interception seams | 414 |
| `packages/experimental/inspector` | `@deepseek-ai/dsh-experimental-inspector` | Experimental cross-realm CDP hub for Host debugging and Client Runtime inspection | 16136 |
| `packages/experimental/inspector-profile` | `@deepseek-ai/dsh-experimental-inspector-profile` | Optional Web bundle for raw Session logs and Chat node inspection | 3 |
| `packages/experimental/liveshare` | `@deepseek-ai/dsh-experimental-liveshare` | Opt-in LiveShare host bundle: share a Session through a separate Relay at the view or bounded-write tier, with forking and attachment uploads as independent switches | 16919 |
| `packages/experimental/liveshare-protocol` | `@deepseek-ai/dsh-experimental-liveshare-protocol` | Liveshare wire frames and the identity contract shared by the owner bundle and the Relay | 1141 |
| `packages/experimental/personalized-recommendations` | `@deepseek-ai/dsh-personalized-recommendations` | Personalized pages and built-in plugin recommendations offered as cards below answers | 2 |
| `packages/experimental/plugin-market-bundle` | `@deepseek-ai/dsh-experimental-plugin-market-bundle` | Experimental custom plugin indexes: a Discover tab that browses and installs bundles from plugin indexes | 2 |
| `packages/experimental/plugin-recommendations` | `@deepseek-ai/dsh-plugin-recommendations` | Official plugin suggestions with explicit user activation and persistent conversation decisions | 240 |
| `packages/experimental/ptc-runtime-python` | `@deepseek-ai/dsh-experimental-ptc-runtime-python` | CPython subprocess implementation of the DeepSeek Harness PTC execution seam | 3124 |
| `packages/experimental/ralph-bundle` | `@deepseek-ai/dsh-experimental-ralph-bundle` | Run explicitly requested repeated work with fresh agents. | 2 |
| `packages/experimental/session-inspector` | `@deepseek-ai/dsh-experimental-session-inspector` | Experimental virtualized Session log and live Chat group/node inspectors | 2426 |
| `packages/experimental/session-search` | `@deepseek-ai/dsh-experimental-session-search` | Give agents tools to search and read earlier sessions from the current workspace. | 2 |
| `packages/experimental/session-title-all-prompts-llm` | `@deepseek-ai/dsh-session-title-all-prompts-llm` | All-user-messages LLM provider plugin for DeepSeek Harness session titles | 176 |
| `packages/experimental/session-titles-bundle` | `@deepseek-ai/dsh-experimental-session-titles-bundle` | Refresh session titles as new human prompts arrive. | 2 |
| `packages/experimental/skill-badge` | `@deepseek-ai/dsh-skill-badge` | Bundled dsh badge skill provider for DeepSeek Harness | 60 |
| `packages/experimental/speech-to-text` | `@deepseek-ai/dsh-experimental-speech-to-text` | Experimental speech recognition with independently selectable providers | 370 |
| `packages/experimental/speech-to-text-sensevoice` | `@deepseek-ai/dsh-experimental-speech-to-text-sensevoice` | Local SenseVoice ONNX transcription with a managed sherpa-onnx process | 922 |
| `packages/experimental/subagent-oar` | `@deepseek-ai/dsh-experimental-subagent-oar` | Experimental one-shot subagents through OAR runtimes | 406 |
| `packages/experimental/terminal-bundle` | `@deepseek-ai/dsh-experimental-terminal-bundle` | Keep shell processes alive across tool calls. | 2 |
| `packages/experimental/tool-agent-team` | `@deepseek-ai/dsh-experimental-tool-agent-team` | Scoped model-facing Agent Teams tools over ctx.agentTeams | 432 |
| `packages/experimental/tool-ralph` | `@deepseek-ai/dsh-tool-ralph` | Model-facing fresh-agent Ralph loop over the workflow and subagent seams | 477 |
| `packages/experimental/tool-session-query` | `@deepseek-ai/dsh-tool-session-query` | Workspace-authorized model-facing session history search, trace, and event read tools | 1413 |
| `packages/experimental/tool-subagent-oar` | `@deepseek-ai/dsh-experimental-tool-subagent-oar` | Delegate standalone tasks to configured external subagent providers | 103 |
| `packages/experimental/tool-terminal` | `@deepseek-ai/dsh-tool-terminal` | Six model-facing persistent PTY tools with owner isolation and generic background-job integration | 617 |
| `packages/experimental/tool-worktree` | `@deepseek-ai/dsh-experimental-tool-worktree` | Model tool that creates and enters a new Git worktree | 43 |
| `packages/experimental/translator` | `@deepseek-ai/dsh-experimental-translator` | Machine translation with reusable Session results | 824 |
| `packages/experimental/voice-input-bundle` | `@deepseek-ai/dsh-experimental-voice-input-bundle` | Experimental voice input with local SenseVoice; downloads its runtime on first use | 2 |
| `packages/experimental/webhook` | `@deepseek-ai/dsh-webhook` | Fire-and-forget webhook rule runtime that creates Workspace-backed DeepSeek Harness Sessions | 456 |
| `packages/experimental/webhook-github` | `@deepseek-ai/dsh-webhook-github` | Signed GitHub HTTP webhook adapter for the DeepSeek Harness webhook runtime | 283 |
| `packages/experimental/webworker-packer` | `@deepseek-ai/dsh-experimental-webworker-packer` | Build-time packer for the browser runtime's base VFS image and ordered data-overlay archives | 1371 |
| `packages/experimental/webworker-runtime` | `@deepseek-ai/dsh-experimental-webworker-runtime` | Browser-only harness runtime: in-memory VFS, module transform and loader, postMessage tunnel, and the dedicated Web Worker assembly, with the Node-compatibility layer that lets the host tree run unchanged | 14418 |
| `packages/experimental/worktree` | `@deepseek-ai/dsh-experimental-worktree` | Creates a named Git worktree and changes the calling Session working directory | 486 |

## packages/extensions（4）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/extensions/cordis-client-runner` | `@deepseek-ai/dsh-cordis-client-runner` | Browser half of dynamic dual-half plugin packages: event subscription, closure evaluation, guard facade, and loader entries | 8622 |
| `packages/extensions/cordis-host-runner` | `@deepseek-ai/dsh-cordis-host-runner` | Dynamic package definition registry, host-half sandbox lifecycle, and invoke handler table for model-mounted dual-half packages | 3391 |
| `packages/extensions/tool-cordis` | `@deepseek-ai/dsh-tool-cordis` | Read-only runtime API inspection for Harness plugin development | 10507 |
| `packages/extensions/ui-cordis` | `@deepseek-ai/dsh-client-ui-cordis` | Cordis dynamic-plugin definition card: the keyed cordis_define tool row with its run/stop switch | 1118 |

## packages/feedback（2）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/feedback/command-feedback` | `@deepseek-ai/dsh-command-feedback` | Log-only session feedback: the record event, the sessionFeedback Host Remote, and the human-facing slash command | 196 |
| `packages/feedback/message-feedback` | `@deepseek-ai/dsh-message-feedback` | Canonical Session-log ratings and notes for finalized assistant messages | 490 |

## packages/fs（7）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/fs/fs` | `@deepseek-ai/dsh-fs` | Abstract filesystem capability seam (ctx.fs) for the DeepSeek Harness — vocabulary types, the FileSystem service (text IO + optional version-guarded atomic mutations), and the fs/* policy event vocabulary | 499 |
| `packages/fs/fs-local` | `@deepseek-ai/dsh-fs-local` | Local-filesystem implementation of the DeepSeek Harness filesystem seam (ctx.fs) | 1286 |
| `packages/fs/fs-observation-policy` | `@deepseek-ai/dsh-fs-observation-policy` | File-context policy plugin for the DeepSeek Harness — observed-state, read-before-edit, and version-guarded write/edit added over the ctx.fs provider seam through the fs/* event gate (no service API) | 159 |
| `packages/fs/fs-sandbox` | `@deepseek-ai/dsh-fs-sandbox` | Sandbox-enforcing implementation of the DeepSeek Harness filesystem seam: fences write/edit by the per-call sandbox mode (read-only denies mutation, workspace-write contains it to the workspace + temp roots) while reads pass through | 223 |
| `packages/fs/tool-fs` | `@deepseek-ai/dsh-tool-fs` | Model-facing filesystem tools (read, write, edit) over the DeepSeek Harness filesystem seam (ctx.fs) | 1566 |
| `packages/fs/tool-fs-search` | `@deepseek-ai/dsh-tool-fs-search` | Model-facing filesystem discovery tools (glob, grep) backed by the packaged ripgrep binary (@vscode/ripgrep) | 1558 |
| `packages/fs/tool-str-replace-editor` | `@deepseek-ai/dsh-tool-str-replace-editor` | Model-facing view, create, literal replace, and line insert tool over the Harness filesystem service | 532 |

## packages/goal（4）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/goal/command-goal` | `@deepseek-ai/dsh-command-goal` | Human-facing slash command for persisted same-session goals | 198 |
| `packages/goal/goal` | `@deepseek-ai/dsh-goal` | Event-sourced same-session goal state and lifecycle service for the DeepSeek Harness | 1306 |
| `packages/goal/goal-round-driver` | `@deepseek-ai/dsh-goal-round-driver` | Race-fenced same-session goal-round driver | 503 |
| `packages/goal/tool-goal` | `@deepseek-ai/dsh-tool-goal` | Model-facing same-session goal tools with execution-time authority checks | 482 |

## packages/guard（2）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/guard/repeat-tool-reminder` | `@deepseek-ai/dsh-repeat-tool-reminder` | Repeat-tool-call guard plugin: advisory reminders when an agent loops on identical tool calls | 240 |
| `packages/guard/timeout-policy` | `@deepseek-ai/dsh-tool-call-timeout-policy` | Tool-call timeout policy: a tools/execute wrapper that arms a per-tool deadline on exec.signal and returns TOOL_TIMEOUT when it wins | 81 |

## packages/host（9）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/host/directory-picker` | `@deepseek-ai/dsh-host-directory-picker` | Abstract workspace-directory picking seam (ctx.directoryPicker) for the DeepSeek Harness web GUI host | 154 |
| `packages/host/directory-picker-auto` | `@deepseek-ai/dsh-host-directory-picker-auto` | Adaptive chooser of the directory-picker seam: resolves the host situation at boot and mounts the native or browse backend for the DeepSeek Harness web GUI host | 217 |
| `packages/host/directory-picker-browse` | `@deepseek-ai/dsh-host-directory-picker-browse` | In-app browsing backend of the directory-picker seam (listing/creation primitives over the host filesystem) | 324 |
| `packages/host/directory-picker-native` | `@deepseek-ai/dsh-host-directory-picker-native` | Native-OS-chooser backend of the directory-picker seam for the DeepSeek Harness web GUI host | 781 |
| `packages/host/frontend-static` | `@deepseek-ai/dsh-host-frontend-static` | SPA dist server for the Web shell: owns the webserver fallback seat, serving explicit index entries and static assets with traversal rejection and 404 misses | 167 |
| `packages/host/open-in-app` | `@deepseek-ai/dsh-host-open-in-app` | Host half of open-in-app: resolved application catalog, icons, and the launch endpoint as three webServer routes | 1668 |
| `packages/host/plugin-inventory` | `@deepseek-ai/dsh-host-plugin-inventory` | Read-only Remote projection of current Cordis Loader plugin state | 198 |
| `packages/host/product-telemetry-otel` | `@deepseek-ai/dsh-host-product-telemetry-otel` | Explicit product usage events exported through OpenTelemetry HTTP logs | 121 |
| `packages/host/webserver` | `@deepseek-ai/dsh-host-webserver` | Web route-registration plugin: HTTP and upgrade routes, per-Peer index transform taps, and static dist fallback | 862 |

## packages/identity（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/identity/anonymous-user-id` | `@deepseek-ai/dsh-anonymous-user-id` | Shared anonymous user identity for DeepSeek Harness telemetry and feedback correlation | 100 |

## packages/interaction（5）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/interaction/commands` | `@deepseek-ai/dsh-commands` | Plugin-owned human command registry for DeepSeek Harness UIs | 692 |
| `packages/interaction/permission-presets` | `@deepseek-ai/dsh-permission-presets` | User-facing permission presets (ctx.permissionPresets) for the DeepSeek Harness: one product-level Permissions select bundling the sandbox-mode and approval-policy knobs, written through to their own session events | 555 |
| `packages/interaction/tool-ask-user` | `@deepseek-ai/dsh-tool-ask-user` | Model-facing ask_user_question tool over the ctx.userQuestions seam | 332 |
| `packages/interaction/user-approval` | `@deepseek-ai/dsh-user-approval` | User-approval seam (ctx.approval) for the DeepSeek Harness: one-shot permission decisions dispatched to composed answerers over the approval/request waterfall, fail-closed by default | 429 |
| `packages/interaction/user-questions` | `@deepseek-ai/dsh-user-questions` | Abstract user-questions seam (ctx.userQuestions) for asking the human during agent runs | 959 |

## packages/jobs（3）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/jobs/jobs` | `@deepseek-ai/dsh-jobs` | Background job registry (ctx.jobs) for the DeepSeek Harness — shared ids, owner isolation, polling, cancellation, and completion listeners for long-running tool work | 682 |
| `packages/jobs/jobs-local` | `@deepseek-ai/dsh-jobs-local` | Process-local implementation of the DeepSeek Harness background job registry seam | 1038 |
| `packages/jobs/tool-jobs` | `@deepseek-ai/dsh-tool-jobs` | Model-facing background job control tools (job_output, job_list, job_kill) over the ctx.jobs registry | 688 |

## packages/llm（9）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/llm/deepseek-llm-api-extensions` | `@deepseek-ai/dsh-deepseek-llm-api-extensions` | Additive request-field registry for the official DeepSeek LLM API adapter | 203 |
| `packages/llm/llm` | `@deepseek-ai/dsh-llm` | Provider-neutral LLM service interface for the DeepSeek Harness | 4118 |
| `packages/llm/llm-deepseek` | `@deepseek-ai/dsh-llm-deepseek` | DeepSeek Messages adapter | 3635 |
| `packages/llm/llm-deepseek-account` | `@deepseek-ai/dsh-llm-deepseek-account` | DeepSeek account provider authentication and discovery | 198 |
| `packages/llm/llm-deepseek-api-key` | `@deepseek-ai/dsh-llm-deepseek-api-key` | DeepSeek api-key provider authentication and discovery | 190 |
| `packages/llm/llm-pi-ai` | `@deepseek-ai/dsh-llm-pi-ai` | pi-ai-backed DeepSeek adapter for the DeepSeek Harness LLM seam (design-verification twin of dsh-llm-deepseek) | 4294 |
| `packages/llm/llm-retry` | `@deepseek-ai/dsh-llm-retry` | Provider-routed LLM request retry policy for the DeepSeek Harness | 318 |
| `packages/llm/plugin-package-inventory-deepseek` | `@deepseek-ai/dsh-plugin-package-inventory-deepseek` | Active Loader-backed plugin package inventory for official DeepSeek LLM API requests | 233 |
| `packages/llm/token-meter` | `@deepseek-ai/dsh-token-meter` | Replay-aware token measurement service (ctx.tokenMeter) for the DeepSeek Harness | 1621 |

## packages/lsp（3）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/lsp/lsp` | `@deepseek-ai/dsh-lsp` | Abstract LSP capability seam (ctx.lsp) for the DeepSeek Harness — language-server provider registry keyed by branded id and extension mapping, order-independent per-query selection, normalized definition/references/implementation/hover requests and results, and the LspError taxonomy | 309 |
| `packages/lsp/lsp-stdio` | `@deepseek-ai/dsh-lsp-stdio` | Generic stdio language-server provider for the DeepSeek Harness LSP capability seam (ctx.lsp) — spawns configured servers, translates JSON-RPC, and serves transient-open goToDefinition/findReferences/goToImplementation/hover queries in the host filesystem namespace | 1643 |
| `packages/lsp/tool-lsp` | `@deepseek-ai/dsh-tool-lsp` | Model-facing lsp tool over the DeepSeek Harness LSP capability seam (ctx.lsp) — one read-only tool with goToDefinition/findReferences/goToImplementation/hover operations, one-based UTF-16 cursor coordinates, bounded location rendering, and hover normalization | 436 |

## packages/mcp（2）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/mcp/mcp-client` | `@deepseek-ai/dsh-mcp-client` | MCP client bridge: connects to MCP servers and registers their tools on ctx.tools | 1216 |
| `packages/mcp/mcp-resources` | `@deepseek-ai/dsh-mcp-resources` | Scoped MCP resource discovery and reading through shared model tools | 217 |

## packages/plan（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/plan/plan-mode` | `@deepseek-ai/dsh-plan-mode` | Logged per-agent plan mode with deployment guidance, a direct slash command, and a user-reviewed exit | 538 |

## packages/preset（5）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/preset/agent-preset` | `@deepseek-ai/dsh-agent-preset` | Declare an Agent capability composition in Cordis YAML | 30 |
| `packages/preset/agent-preset/skills/cordis-plugin-development/templates/decoration` | `@local/my-decoration` |  | 0 |
| `packages/preset/agent-preset/skills/cordis-plugin-development/templates/mcp` | `@local/demo-mcp` |  | 0 |
| `packages/preset/agent-preset-registry` | `@deepseek-ai/dsh-agent-preset-registry` | Declarative Agent preset registry and profile-backed editing | 1083 |
| `packages/preset/persona` | `@deepseek-ai/dsh-persona` | Composition-authored deployment persona section for the DeepSeek Harness | 75 |

## packages/ptc-runtime（2）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/ptc-runtime/ptc-runtime` | `@deepseek-ai/dsh-ptc-runtime` | Abstract PTC execution seam (ctx.ptcRuntime) for the DeepSeek Harness | 343 |
| `packages/ptc-runtime/ptc-runtime-node` | `@deepseek-ai/dsh-ptc-runtime-node` | Node PTC execution with async function, REPL and VM Script evaluators and optional retained state | 2740 |

## packages/sandbox（4）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/sandbox/sandbox` | `@deepseek-ai/dsh-sandbox` | Abstract process-sandbox seam (ctx.sandbox) for the DeepSeek Harness: same-world confinement vocabulary and the SandboxProvider contract | 663 |
| `packages/sandbox/sandbox-local` | `@deepseek-ai/dsh-sandbox-local` | Local process-sandbox backends for the DeepSeek Harness sandbox seam: bwrap, the npm-distributed landlock-run launcher, macOS Seatbelt, or the Windows ACL restricted-token runner — functionally probed, fail-closed | 646 |
| `packages/sandbox/sandbox-policy` | `@deepseek-ai/dsh-sandbox-policy` | Per-call sandbox policy resolver and current model context: deployment fallbacks plus each session's mode and workspace root, shared by every enforcing capability family | 272 |
| `packages/sandbox/sandbox-windows-acl` | `@deepseek-ai/dsh-sandbox-windows-acl` | Windows ACL write-restriction sandbox backend (restricted-token spawn with capability-SID write allowlist) for the DeepSeek Harness sandbox seam | 2183 |

## packages/schedule（2）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/schedule/schedule` | `@deepseek-ai/dsh-schedule` | Host-wide durable reminders with shared management and original-Session delivery | 3363 |
| `packages/schedule/tool-schedule` | `@deepseek-ai/dsh-tool-schedule` | Model-facing reminder management tools (schedule_create, schedule_list, schedule_update, schedule_delete) over the Host ctx.schedule service | 590 |

## packages/sdk（3）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/sdk/client` | `@deepseek-ai/dsh-sdk-client` | TypeScript client SDK for driving a DeepSeek Harness runtime subprocess over stdio JSON-RPC: the DeepSeekHarness high-level turns API and the lower-level HarnessClient | 1324 |
| `packages/sdk/protocol` | `@deepseek-ai/dsh-sdk-protocol` | Shared wire protocol for the DeepSeek Harness SDK runtime: the newline-delimited JSON-RPC stdio transport and the named request, result, and notification types spoken between the runtime server and SDK clients | 533 |
| `packages/sdk/server` | `@deepseek-ai/dsh-sdk-jsonrpc-server` | Stdio JSON-RPC server plugin for out-of-process DeepSeek Harness SDK clients | 697 |

## packages/session（22）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/session/message-quotes` | `@deepseek-ai/dsh-message-quotes` | Selected-text quotation and Markdown blockquote presentation | 162 |
| `packages/session/session-checkpoint-policy` | `@deepseek-ai/dsh-session-checkpoint-policy` | Semantic session durability checkpoints before model requests and tool side effects | 83 |
| `packages/session/session-format` | `@deepseek-ai/dsh-session-format` | Streaming adjacent Session format migration machinery | 945 |
| `packages/session/session-format-catalog` | `@deepseek-ai/dsh-session-format-catalog` | Build-static first-party Session format codec and migration catalog | 153 |
| `packages/session/session-format-v0-to-v1` | `@deepseek-ai/dsh-session-format-v0-to-v1` | Frozen released-v0 Session codec and identity migration to v1 | 2867 |
| `packages/session/session-format-v1-to-v2` | `@deepseek-ai/dsh-session-format-v1-to-v2` | Frozen released-v1 Session codec and assistant-stream migration to v2 | 1256 |
| `packages/session/session-format-v2-to-v3` | `@deepseek-ai/dsh-session-format-v2-to-v3` | Streaming system-prompt, canonical-envelope and PTC migration into V3 | 815 |
| `packages/session/session-format-v3-to-v4` | `@deepseek-ai/dsh-session-format-v3-to-v4` | Streaming tool-role migration and delivery validation from Session V3 to V4 | 1675 |
| `packages/session/session-log-deepseek` | `@deepseek-ai/dsh-session-log-deepseek` | Incremental lossless session-log request extension for the official DeepSeek LLM API | 337 |
| `packages/session/session-persistence` | `@deepseek-ai/dsh-session-persistence` | Abstract durable session persistence seam (ctx.sessionPersistence) for the DeepSeek Harness | 636 |
| `packages/session/session-persistence-jsonl` | `@deepseek-ai/dsh-session-persistence-jsonl` | JSONL durable session persistence backend for the DeepSeek Harness | 5086 |
| `packages/session/session-projection` | `@deepseek-ai/dsh-session-projection` | Session-projection seam: the merge-extensible projection type table, the provider contract, and the ctx.sessionProjections registry serving whole current values of log-derived per-session state | 941 |
| `packages/session/session-projection-cache` | `@deepseek-ai/dsh-session-projection-cache` | Persisted projection cache (ctx.sessionProjectionCache): durable per-session checkpoint records on the session_projcache storage domain (per-record layout), throttled write-behind, and the cached listing read | 579 |
| `packages/session/session-stats` | `@deepseek-ai/dsh-session-stats` | Whole-log conversation counts and wall times projection (sessionStats) for the DeepSeek Harness | 299 |
| `packages/session/session-telemetry` | `@deepseek-ai/dsh-session-telemetry` | SessionTelemetryBackend seam for the DeepSeek Harness: session-event capture, projection, redaction, and handoff to a reporting backend | 479 |
| `packages/session/session-telemetry-otel` | `@deepseek-ai/dsh-session-telemetry-otel` | Feedback-authorized Session logs over byte-bounded OpenTelemetry HTTP requests | 278 |
| `packages/session/session-title` | `@deepseek-ai/dsh-session-title` | Log-backed session title service and provider registry for the DeepSeek Harness | 1027 |
| `packages/session/session-title-first-prompt-llm` | `@deepseek-ai/dsh-session-title-first-prompt-llm` | First-message LLM provider plugin for DeepSeek Harness session titles | 167 |
| `packages/session/session-title-llm` | `@deepseek-ai/dsh-session-title-llm` | Shared LLM generation policy for DeepSeek Harness session-title providers | 285 |
| `packages/session/session-turn-outline` | `@deepseek-ai/dsh-session-turn-outline` | Whole-log turn outline projection (turnOutline) for the DeepSeek Harness | 229 |
| `packages/session/tool-working-directory` | `@deepseek-ai/dsh-tool-working-directory` | Read and change the active Session working directory | 42 |
| `packages/session/working-directory` | `@deepseek-ai/dsh-working-directory` | Session working directories with durable changes and model context | 225 |

## packages/session-query（3）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/session-query/session-log-export` | `@deepseek-ai/dsh-session-log-export` | Web Session-log ZIP export and Session Markdown copy | 1802 |
| `packages/session-query/session-query` | `@deepseek-ai/dsh-session-query` | Combined session query service contract with concrete reads, traces, and filters | 2201 |
| `packages/session-query/session-query-sqlite` | `@deepseek-ai/dsh-session-query-sqlite` | Concrete ctx.sessionQuery backend with SQLite FTS5 search | 1781 |

## packages/settings（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/settings/settings` | `@deepseek-ai/dsh-settings` | Abstract user-settings seam (ctx.settings) for the DeepSeek Harness | 704 |

## packages/shell（10）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/shell/bash-local` | `@deepseek-ai/dsh-bash-local` | Local-subprocess implementation of the DeepSeek Harness bash executor seam | 404 |
| `packages/shell/bash-sandbox` | `@deepseek-ai/dsh-bash-sandbox` | Sandbox-consuming implementation of the DeepSeek Harness bash executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) | 206 |
| `packages/shell/pwsh-local` | `@deepseek-ai/dsh-pwsh-local` | Local PowerShell implementation of the DeepSeek Harness bash executor seam | 528 |
| `packages/shell/pwsh-sandbox` | `@deepseek-ai/dsh-pwsh-sandbox` | Sandbox-consuming implementation of the DeepSeek Harness PowerShell executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) | 320 |
| `packages/shell/shell` | `@deepseek-ai/dsh-shell` | Abstract bash executor seam (ctx.shell) for the DeepSeek Harness | 377 |
| `packages/shell/shell-env` | `@deepseek-ai/dsh-shell-env` | Tool-independent managed DSH_* shell environment registry | 211 |
| `packages/shell/tool-bash` | `@deepseek-ai/dsh-tool-bash` | Model-facing bash tool with optional generic background-job and sandbox-escalation support | 811 |
| `packages/shell/tool-bash-persistent` | `@deepseek-ai/dsh-tool-bash-persistent` | Model-facing owner-scoped persistent Bash tool backed by the Harness PTY service | 487 |
| `packages/shell/tool-pwsh` | `@deepseek-ai/dsh-tool-pwsh` | Model-facing pwsh tool over the bash executor seam | 886 |
| `packages/shell/tool-pwsh-persistent` | `@deepseek-ai/dsh-tool-pwsh-persistent` | Model-facing owner-scoped persistent PowerShell tool backed by the Harness PTY service | 500 |

## packages/skill（5）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/skill/skill` | `@deepseek-ai/dsh-skill` | Agent skill provider registry for the DeepSeek Harness | 868 |
| `packages/skill/skill-filesystem` | `@deepseek-ai/dsh-skill-filesystem` | Local filesystem skill provider for the DeepSeek Harness | 1063 |
| `packages/skill/skill-office` | `@deepseek-ai/dsh-skill-office` | Bundled Word, PowerPoint, and Excel workflows and LibreOffice Kit operations | 95 |
| `packages/skill/tool-skill` | `@deepseek-ai/dsh-tool-skill` | Model-facing skill loading tool for the DeepSeek Harness | 451 |
| `packages/skill/tool-workspace-dependencies` | `@deepseek-ai/dsh-tool-workspace-dependencies` | The load_workspace_dependencies tool: absolute paths into a bundled Python, Node.js, and pnpm payload | 322 |

## packages/spill（3）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/spill/spill` | `@deepseek-ai/dsh-spill` | Abstract spill storage seam (ctx.spillStore) for the DeepSeek Harness — save oversized tool text and return a retrieval locator | 138 |
| `packages/spill/spill-local` | `@deepseek-ai/dsh-spill-local` | Local-filesystem implementation of the DeepSeek Harness spill storage seam (private session-scoped files) | 726 |
| `packages/spill/spill-policy` | `@deepseek-ai/dsh-spill-policy` | Token-budgeted tool-result retention with recoverable text and image paths | 346 |

## packages/ssh（5）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/ssh/fs-ssh` | `@deepseek-ai/dsh-fs-ssh` | Filesystem provider over the shared POSIX SSH helper | 107 |
| `packages/ssh/sandbox-ssh` | `@deepseek-ai/dsh-sandbox-ssh` | Remote POSIX sandbox argv provider over the shared SSH helper | 33 |
| `packages/ssh/ssh` | `@deepseek-ai/dsh-ssh` | Shared OpenSSH connection and versioned POSIX remote helper | 1463 |
| `packages/ssh/ssh-helper-runtime` | `@deepseek-ai/dsh-ssh-helper-runtime` | Private executable carrier for the POSIX SSH helper and managed workers | 39 |
| `packages/ssh/subprocess-ssh` | `@deepseek-ai/dsh-subprocess-ssh` | Subprocess and terminal provider over the shared POSIX SSH helper | 345 |

## packages/storage（4）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/storage/storage` | `@deepseek-ai/dsh-storage` | Storage hub (ctx.storage): named backend registry plus mounted data-form facilities for the DeepSeek Harness | 364 |
| `packages/storage/storage-domain` | `@deepseek-ai/dsh-storage-domain` | Domain data form (ctx.storage.domain): schema-validated, event-emitting KV domains over storage backends for the DeepSeek Harness | 910 |
| `packages/storage/storage-json` | `@deepseek-ai/dsh-storage-json` | JSON file KV storage backend for the DeepSeek Harness storage hub | 844 |
| `packages/storage/storage-sqlite` | `@deepseek-ai/dsh-storage-sqlite` | SQLite storage backend (kv facet) for the DeepSeek Harness storage hub | 516 |

## packages/subagent（9）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/subagent/subagent` | `@deepseek-ai/dsh-subagent` | Abstract subagent seam (ctx.subagents): named-provider registry for delegating to child agents | 5163 |
| `packages/subagent/subagent-acp` | `@deepseek-ai/dsh-subagent-acp` | Out-of-process ACP subagent backend: drives a child agent in a spawned subprocess over the Agent Client Protocol | 747 |
| `packages/subagent/subagent-claude-code` | `@deepseek-ai/dsh-subagent-claude-code` | One-shot Claude Code subagent provider over the official Agent SDK | 893 |
| `packages/subagent/subagent-codex` | `@deepseek-ai/dsh-subagent-codex` | One-shot Codex subagent provider over the official app-server protocol | 1280 |
| `packages/subagent/subagent-dsh-sdk` | `@deepseek-ai/dsh-subagent-dsh-sdk` | Out-of-process SDK subagent backend: drives a child DeepSeek Harness runtime subprocess over stdio JSON-RPC through the TypeScript SDK client | 561 |
| `packages/subagent/subagent-fork-in-process` | `@deepseek-ai/dsh-subagent-fork-in-process` | In-process fork subagent backend: runs a child agent seeded with a prefix of the parent's log | 83 |
| `packages/subagent/subagent-spawn-in-process` | `@deepseek-ai/dsh-subagent-spawn-in-process` | In-process spawn subagent backend: runs a fresh child agent on ctx.agents | 59 |
| `packages/subagent/tool-subagent` | `@deepseek-ai/dsh-tool-subagent` | Model-facing subagent delegation tool over the ctx.subagents seam | 952 |
| `packages/subagent/tool-subagent-control` | `@deepseek-ai/dsh-tool-subagent-control` | Shared messaging, interruption, and child discovery tools for subagents | 286 |

## packages/subprocess（3）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/subprocess/subprocess` | `@deepseek-ai/dsh-subprocess` | Subprocess seam (ctx.subprocess) for the DeepSeek Harness — managed process groups, bounded spill-backed output, and escalated kills behind one abstract service | 498 |
| `packages/subprocess/subprocess-local` | `@deepseek-ai/dsh-subprocess-local` | Local-subprocess implementation of the DeepSeek Harness subprocess seam | 5031 |
| `packages/subprocess/win32-process` | `@deepseek-ai/dsh-win32-process` | Shared low-level Win32 process, stdio, and Job Object primitives | 1185 |

## packages/telemetry（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/telemetry/otel` | `@deepseek-ai/dsh-otel` | Cordis service for independent ordinary-event and byte-bounded Session-log OTLP channels | 475 |

## packages/terminal（2）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/terminal/terminal` | `@deepseek-ai/dsh-terminal` | Persistent PTY session seam for the DeepSeek Harness — owner-scoped ids, backend registry, interactive sends, reads, signals, and awaited cleanup | 653 |
| `packages/terminal/terminal-bash` | `@deepseek-ai/dsh-terminal-bash` | Persistent shell PTY backend over the DeepSeek Harness subprocess terminal primitive | 1358 |

## packages/test-support（8）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/test-support/agent-loop-testkit` | `@deepseek-ai/dsh-agent-loop-testkit` | Prerequisite mounting, production AgentLoop drivers, and Inbox stubs for tests | 211 |
| `packages/test-support/client-runtime` | `@deepseek-ai/dsh-client-test-runtime` | Browser test runtimes: a jsdom slot bench with test-owned Session and Workspace doubles, and a whole-client tier that boots the web roster through the production bootClient over an endpoint-named Remote mock | 3063 |
| `packages/test-support/llm-mock-server` | `@deepseek-ai/dsh-llm-mock-server` | Scriptable Messages HTTP/SSE fault server for LLM recovery tests | 1018 |
| `packages/test-support/llm-replay` | `@deepseek-ai/dsh-llm-replay` | Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests) | 1231 |
| `packages/test-support/loader-smoke` | `@deepseek-ai/dsh-loader-smoke` | Shared subprocess and direct-agent harness for keyless real-Loader example smoke tests | 375 |
| `packages/test-support/remote-mock` | `@deepseek-ai/dsh-remote-mock` | Endpoint-named mock for Typert Remote traffic: unary answers and stream scripts per <namespace>/<method>, live stream control, a log, and the Connection carrier face whole-client specs install | 929 |
| `packages/test-support/session-snapshot` | `@deepseek-ai/dsh-session-snapshot` | Session-log snapshot core with an ACP protocol adapter, expected-output normalization, and fixture invariants | 4789 |
| `packages/test-support/tool-testkit` | `@deepseek-ai/dsh-tool-testkit` | Tool definition and execution fixtures for tests and benchmarks | 92 |

## packages/todo（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/todo/tool-todo` | `@deepseek-ai/dsh-tool-todo` | Model-facing todo_write tool over the DeepSeek Harness event-sourced session log | 271 |

## packages/typert（11）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/typert/generator` | `@deepseek-ai/dsh-typert-generator` | TypeScript project analyzer and model-driven Typert artifact generator | 7594 |
| `packages/typert/generator/tests/fixtures/remote-model` | `@fixture/remote-workspace` |  | 0 |
| `packages/typert/generator/tests/fixtures/remote-model/packages/domain` | `@fixture/domain` |  | 21 |
| `packages/typert/generator/tests/fixtures/remote-model/packages/remote` | `@fixture/remote` |  | 59 |
| `packages/typert/generator/tests/fixtures/type-model` | `@fixture/workspace` |  | 0 |
| `packages/typert/generator/tests/fixtures/type-model/packages/client` | `@fixture/client` |  | 39 |
| `packages/typert/generator/tests/fixtures/type-model/packages/host` | `@fixture/host` |  | 307 |
| `packages/typert/generator/tests/fixtures/type-model/packages/write` | `@fixture/write` |  | 18 |
| `packages/typert/loader` | `@deepseek-ai/dsh-typert-loader` | Loader integration for generated Typert package contributions | 507 |
| `packages/typert/protocol` | `@deepseek-ai/dsh-typert-protocol` | Compiler-independent Remote metadata and Typert provider protocols | 1802 |
| `packages/typert/registry` | `@deepseek-ai/dsh-typert-registry` | Runtime registry for generated package reflection and Zod schemas | 977 |

## packages/util（21）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/util/atomic-write` | `@deepseek-ai/dsh-atomic-write` | Zero-dependency atomic file replacement: exclusive-create random-suffix temp + rename carrying the caller-stated permissions (writeFileAtomic) | 273 |
| `packages/util/brand` | `@deepseek-ai/dsh-brand` | Stateless branded primitive types for the DeepSeek Harness | 39 |
| `packages/util/chunked-list` | `@deepseek-ai/dsh-chunked-list` | Persistent append-only chunked lists with bounded copying and JSON checkpoint validation | 58 |
| `packages/util/code-language` | `@deepseek-ai/dsh-util-code-language` | Single file-extension to syntax-highlighting language table shared by Client code surfaces and the Host read card | 233 |
| `packages/util/crypto` | `@deepseek-ai/dsh-util-crypto` | Zero-dependency browser-safe UUID and byte-encoding helpers | 41 |
| `packages/util/deque` | `@deepseek-ai/dsh-deque` | Zero-dependency circular deque with amortized constant-time end operations and bounded vacant storage | 95 |
| `packages/util/file-drag` | `@deepseek-ai/dsh-util-file-drag` | Shared file drag names and native transfer requests | 76 |
| `packages/util/home-paths` | `@deepseek-ai/dsh-home-paths` | Shared filesystem path helpers for the DeepSeek Harness | 197 |
| `packages/util/http-proxy` | `@deepseek-ai/dsh-http-proxy` | Process-wide outbound HTTP proxy policy for DeepSeek Harness: resolve it from the launch environment and install it as undici's global dispatcher | 681 |
| `packages/util/launch-environment` | `@deepseek-ai/dsh-launch-environment` | Immutable DeepSeek Harness launch environment that records which layer supplied each value | 137 |
| `packages/util/lazy-require` | `@deepseek-ai/dsh-lazy-require` | Caller-relative, success-cached lazy loading for CommonJS-compatible Host dependencies | 24 |
| `packages/util/native-command` | `@deepseek-ai/dsh-native-command` | Host-native command and path-opening utilities with shell-free execution, cancellation, desktop detection, and WSL handoff | 1036 |
| `packages/util/official-bundles` | `@deepseek-ai/dsh-official-bundles` | Installation-owned lists of official dsh bundles (shipped profile templates, optional, on-demand, and retired bundles) and the plugin manager's protected and presented packages | 205 |
| `packages/util/output-retention` | `@deepseek-ai/dsh-output-retention` | Zero-dependency bounded-retention primitive: ItemRetainer/TextRetainer + neutral notice helpers (what did we keep, what did we omit) | 460 |
| `packages/util/package-manifest` | `@deepseek-ai/dsh-package-manifest` | Shared type declarations for package.json.dsh configuration fields | 115 |
| `packages/util/plugin-detail` | `@deepseek-ai/dsh-plugin-detail` | Plugin detail documents: meta.detail or README selection, image paths, and local and npm CDN file sources | 485 |
| `packages/util/plugin-market-index` | `@deepseek-ai/dsh-plugin-market-index` | Plugin market index format 1: JSON validation, relative icon resolution, and pinned install arguments | 440 |
| `packages/util/time` | `@deepseek-ai/dsh-util-time` | Time vocabulary shared by the boundaries that accept a caller's zone, a wall-clock selector, or an elapsed time: canonicalClientTimeZone (IANA zone validation and canonicalization), strict RFC 3339 instant, local-calendar, and zone resolution, and a millisecond Duration span | 467 |
| `packages/util/timeout` | `@deepseek-ai/dsh-timeout` | Zero-dependency timeout/deadline primitive: clampTimeout, deadline, timeoutOf, TimeoutReason (timing + classification only, no termination) | 212 |
| `packages/util/values` | `@deepseek-ai/dsh-util-values` | Duplicate-install-safe value primitives for the DeepSeek Harness | 974 |
| `packages/util/workspace-path` | `@deepseek-ai/dsh-util-workspace-path` | Browser-safe Workspace path and display helpers | 236 |

## packages/web（7）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/web/tool-web` | `@deepseek-ai/dsh-tool-web` | Model-facing web tools (web_search, web_fetch) over the DeepSeek Harness web capability seam (ctx.web) | 1042 |
| `packages/web/web` | `@deepseek-ai/dsh-web` | Abstract web access capability seam (ctx.web) for the DeepSeek Harness — search/fetch provider registry, registration-order-independent selection, request/result vocabulary, and the WebError taxonomy | 402 |
| `packages/web/web-deepseek-api` | `@deepseek-ai/dsh-web-deepseek-api` | DeepSeek Search and Fetch API providers for the DeepSeek Harness web capability seam (ctx.web) | 641 |
| `packages/web/web-fetch-http` | `@deepseek-ai/dsh-web-fetch-http` | Anonymous HTTP(S) fetch provider for the DeepSeek Harness web capability seam (ctx.web) | 467 |
| `packages/web/web-search-deepseek` | `@deepseek-ai/dsh-web-search-deepseek` | DeepSeek-backed search provider (native web_search via the Anthropic-compatible API) for the DeepSeek Harness web capability seam (ctx.web) | 676 |
| `packages/web/web-search-exa` | `@deepseek-ai/dsh-web-search-exa` | Exa-backed search provider for the DeepSeek Harness web capability seam (ctx.web) | 270 |
| `packages/web/web-search-perplexity` | `@deepseek-ai/dsh-web-search-perplexity` | Perplexity-backed search provider for the DeepSeek Harness web capability seam (ctx.web) | 264 |

## packages/workflow（3）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/workflow/tool-workflow` | `@deepseek-ai/dsh-tool-workflow` | Model-facing workflow tool: run a JavaScript orchestration script over ctx.workflowEngine | 615 |
| `packages/workflow/workflow` | `@deepseek-ai/dsh-workflow` | Workflow capability seam: ctx.workflowEngine service, run vocabulary, and workflow/* events | 383 |
| `packages/workflow/workflow-ptc` | `@deepseek-ai/dsh-workflow-ptc` | Workflow orchestration in the shared sandboxed Node PTC runtime | 1340 |

## packages/workspace（1）

| 路徑 | 套件名 | 說明 | LOC |
|---|---|---|---|
| `packages/workspace/workspace` | `@deepseek-ai/dsh-workspace` | Workspace entity registry (ctx.workspaceRegistry): durable workspace records with validated session attachment over the domain data form for the DeepSeek Harness | 1425 |

