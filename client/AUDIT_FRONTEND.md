# Tazelyx (Akıllı Kiler) — Frontend Design / UX / Code Audit

**Scope:** `client/src/` only (React Native 0.81 · Expo SDK 54 · Expo Router · NativeWind · TypeScript strict).
**Method:** full read of all 43 source files, plus a new Jest unit-test harness for the pure logic layer.
**Date:** 2026-08-10. **Excluded by instruction:** `receipt-ai/` backend; the deliberate "custom header + custom tab bar instead of React Navigation chrome" architecture.

---

## Executive Summary

This is a well above-average student-thesis frontend. The architecture is sound and deliberate: routing is cleanly separated into `(auth)` / `(app)` / `(tabs)` groups with `Stack.Protected` guards, authentication state lives in SecureStore behind a single context with a global 401 force-logout handler, theming is centralised in one `ThemeContext` that drives NativeWind's `dark:` variants rather than the raw OS setting, and the trickiest past bugs (the `KeyboardAvoidingView` oscillation, the notification-type cross-cancellation, the calendar-day-vs-rolling-24h expiry math) are not only fixed but documented in-place with comments that explain *why*. TypeScript is `strict: true` with **zero `any`, zero `@ts-ignore`, and only three non-null assertions**, all provably safe. That is genuinely unusual discipline.

The weaknesses are the ones you would predict from a solo-built app that grew feature-first. Three categories stand out:

1. **State-consistency bugs in the optimistic-update paths.** The pantry's 4-second undo window does not survive a tab switch (deleted items reappear, then silently vanish from the server), and the shopping list can get permanently stuck on an error screen after a single transient network failure. These are real, reproducible defects, not opinions.
2. **Silent failure as a pattern.** Three separate write paths (`shopping-list.tsx` add, `running-low.tsx` add-to-list, the pantry's delete-rollback) swallow errors with an empty `catch {}` and give the user no feedback whatsoever. This is the single most user-hostile behaviour in the app.
3. **Design-system drift.** Two competing light backgrounds (`bg-slate-50` vs `bg-surface`), two competing text-colour vocabularies (`text-ink*` design tokens vs raw `text-slate-*`), and semantic status colours that are byte-identical in light and dark mode and consequently fail WCAG AA contrast in dark mode. Dark mode is *far* better implemented than the typical bolt-on — most surfaces are correctly paired — but the icon-colour and error-text layers were missed.

There is **zero accessibility instrumentation**: not a single `accessibilityLabel`, `accessibilityRole`, or `accessibilityState` in the entire codebase, and roughly a dozen icon-only controls fall below the 44 pt minimum touch target. For a thesis defence this is a defensible omission; for production it is a blocker.

**Verdict for a thesis committee:** the implementation demonstrably meets the standard for a defended undergraduate software-engineering thesis — the architecture, the domain logic, and the documented bug-fix reasoning are all strong. **Verdict for production:** not yet. Fix the state-consistency bugs, replace the silent catches with visible error UI, move the hardcoded LAN IP out of source, and add accessibility labels — roughly 2–3 focused days of work.

---

## Design Language Findings

### DL-1 — Two competing "page background" colours (Medium)

The app defines a `surface` token (`#F4F7F8`) in `tailwind.config.js`, and `(app)/_layout.tsx:14` pins the native stack's `contentStyle` to that exact value. But only half the screens honour it:

| Uses `bg-surface` (`#F4F7F8`) | Uses `bg-slate-50` (`#F8FAFC`) |
| --- | --- |
| `(tabs)/dashboard.tsx:116` | `(tabs)/index.tsx:257` |
| `(tabs)/recipes.tsx:140` | `(tabs)/upload.tsx:215` |
| `settings.tsx:81` | `shopping-list.tsx:131` |
| `score.tsx:212` | `expiring-soon.tsx:35` |
| `upload-history.tsx:44` | `product-list.tsx:51`, `running-low.tsx:71` |

The two values differ by ~1.5% luminance, so it will not read as "broken" — but it means the design token exists and is ignored half the time, and during stack push/pop animations the container colour (`#F4F7F8`) briefly differs from the incoming screen (`#F8FAFC`). Pick one; `bg-surface` is the documented intent.

### DL-2 — Two competing text-colour vocabularies (Medium)

`tailwind.config.js` defines `ink` / `ink-muted` specifically so "screens stop each picking their own `slate-*` tone" (the config's own comment says this). It half-worked. Raw `slate-*` still appears throughout, sometimes **in the same file** as the tokens:

- `(tabs)/index.tsx:92` uses `text-ink dark:text-white` for a product name, but `:344` and `:371` use `text-slate-900 dark:text-white` for empty-state headings, and `:267`/`:374` use `text-slate-500 dark:text-slate-400` where `text-ink-muted` is the token.
- `expiring-soon.tsx`, `product-list.tsx`, `running-low.tsx`, `shopping-list.tsx`, `add-product.tsx`, `edit-product.tsx`, `upload.tsx` are entirely raw `slate-*`.
- `dashboard.tsx`, `recipes.tsx`, `score.tsx`, `settings.tsx`, `upload-history.tsx` are mostly tokenised.

Net effect: the same semantic role (muted secondary text) is rendered as `#6E7A8D` on some screens and `#64748B` (`slate-500`) on others.

### DL-3 — Glassmorphism is used in exactly two places, with different tints (Low, but worth naming)

- `AuthBackground.tsx:40-44` — `BlurView intensity={35} tint="light"` over the auth photo. Correct and consistent across all five auth screens.
- `(tabs)/_layout.tsx:42-43` — `BlurView intensity={50} tint="dark"` for the floating tab dock, immediately overlaid with a 92%-opaque `rgba(12,22,36,0.92)` fill.

The second one is worth flagging as a code smell more than a design one: a 92%-opaque layer on top of a blur means **the blur is doing almost nothing** while still costing a real-time GPU pass on every frame. Either drop `intensity` to something visible (lower the overlay to ~0.7) or remove the `BlurView` and keep the solid fill. The glass language does *not* leak anywhere else — no other screen uses `BlurView`, which is the right call.

### DL-4 — Icon vocabulary is consistent except for three hand-rolled glyphs (Low)

`@expo/vector-icons` Ionicons is used uniformly (~40 usages, outline variants for idle / filled for focused in the tab bar — a good, consistent rule). Three exceptions break it:

- `(tabs)/index.tsx:403` — the FAB renders a `<Text>+</Text>` instead of `<Ionicons name="add" />`. Font-dependent vertical centring; `shopping-list.tsx:184` uses the proper `Ionicons name="add"` for the same semantic action.
- `edit-product.tsx:157,170` — quantity steppers use `<Text>−</Text>` / `<Text>+</Text>` (note: a real U+2212 minus, not a hyphen — good instinct, wrong tool). `Ionicons remove`/`add` exist.
- `score.tsx:112-135` — the info button is two `<View>`s stacked to hand-draw a lowercase "i". The comment explains this was to avoid glyph ambiguity, but `Ionicons information-circle-outline` exists and is used nowhere.

### DL-5 — Lyx mascot system: consistent, with one duplication (Low)

All 25 PNGs exist (`assets/images/lyx/`, verified) and the 4 per-tab × 5-tier maps in `lib/lyxMoodImages.ts` are complete and correctly wired to the four tab headers at a uniform `size={87}` (the `LyxMascot` default; no caller overrides it). The score screen renders the mascot at 140 px (hero) and 44 px (legend rows) — appropriate scale jumps, not drift.

The gap: `score.tsx:33-51` declares the **generic** 5-image set *twice* — once as `MOOD_LEGEND` and once as `MOOD_IMAGES` — with the same five `require()` calls duplicated. It also builds its own `<Image>` rather than reusing `LyxMascot` (defensible: `LyxMascot`'s `onPress` navigates to `/score`, which would be a self-navigation). Suggested fix: move the generic set into `lib/lyxMoodImages.ts` as `GLOBAL_MOOD_IMAGES` and derive `MOOD_LEGEND` from it.

### DL-6 — Header chrome is split between two systems (Low — architectural consequence, not a mistake)

The four tab screens use the custom `AppHeader` (100 pt tall, mascot on the left, icon buttons on the right). Every other screen (`score`, `settings`, `shopping-list`, `running-low`, `expiring-soon`, `product-list`, `upload-history`, and both modals) uses the **native** stack header via `headerShown: true` in `(app)/_layout.tsx:24-32`. These are correctly themed (via the `NavigationThemeBridge` in `app/_layout.tsx:33-41`) but visually they are a different design — different height, different type scale, no mascot. This is a reasonable trade-off, but the app reads as two apps stitched together when you push from a tab into a sub-screen. Not a bug; note it in the thesis as a conscious trade-off.

### DL-7 — App identity is still the Expo template's (Medium)

`app.json` still says `"name": "client"`, `"slug": "client"`, `"scheme": "client"`. Consequences:
- The app installs on the device labelled **"client"**, not "Tazelyx".
- Deep links for password reset must be `client://...` — brittle and off-brand, and `reset-password.tsx` depends entirely on that token arriving via deep link.
- Splash background is `#208AEF` (template blue) and the Android adaptive-icon background is `#E6F4FE` (template pale blue) — neither is a brand colour. The brand green `#047857` *is* correctly wired into the notification colour.
- `assets/images/` still ships `react-logo*.png`, `expo-logo.png`, `expo-badge*.png`, `tutorial-web.png`, and an empty `assets/tabIcons/` directory.

---

## Dark Mode Audit

Overall this is a **good** dark-mode implementation, not a bolt-on. The core surface pairs are applied consistently: page `dark:bg-[#0B1220]`, card `dark:bg-[#151F2E]`, border `dark:border-white/10`, body text `dark:text-white` / `dark:text-slate-400`. The two hardest details are also handled — `(app)/_layout.tsx:14` sets `contentStyle` so the native stack container doesn't flash white during transitions, and both `DateTimePicker`s pass `themeVariant` (`upload.tsx:387`, `edit-product.tsx:246`).

What follows is every gap found, screen by screen.

### Global / shared components

| # | File:line | Issue | Severity |
| --- | --- | --- | --- |
| DM-1 | `components/HeaderIconButton.tsx:7` | Default icon colour is hardcoded `#6E7A8D` with no theme branch. Both callers (`TabHeaderActions.tsx:12,20,21`) use the default, so the settings/history icons in **all four tab headers** render mid-grey on a `bg-white/10` chip over `#0B1220` in dark mode → ≈3.3:1. Dim and muddy. Fix: accept `resolvedScheme` or default to `isDark ? "#cbd5e1" : "#6E7A8D"`. | **High** |
| DM-2 | `components/ExpireBadge.tsx:30-31,40-41` | The expiry badge colours are byte-identical in both themes: text `#EF5A5A` / `#D97706` on a 10%-alpha pill (`#EF5A5A1A` / `#D977061A`). Against `#151F2E` cards in dark mode the pill background is effectively invisible and the text lands at ≈4.0:1 (red) and ≈4.3:1 (amber) — both **below WCAG AA 4.5:1** for 12 px semibold text. These are the app's most safety-relevant labels ("Süresi geçti"). Fix: lighten to ~`#F87171` / `#FBBF24` under `dark:`. | **High** |
| DM-3 | error text `text-red-600` (no `dark:` variant) — `add-product.tsx:113`, `edit-product.tsx:221`, `upload.tsx:298,352,457`, `login.tsx:94`, `register.tsx:79`, `reset-password.tsx:98` | `#DC2626` on `#0B1220` ≈ **3.1:1** — fails AA for small text. Eight occurrences, i.e. every form-error message in the app. Fix: `text-red-600 dark:text-red-400`. | **High** |
| DM-4 | `components/AppHeader.tsx:27,30` | Correct — `bg-[#0B1220]` / border `rgba(255,255,255,0.08)` are properly branched on `isDark`. ✅ No action. | — |
| DM-5 | `components/WasteScoreChart.tsx:80,89,104` | Correct — selected-bar tint, empty-bar fill and selected-label colour all branch on `isDark`. ✅ No action. | — |
| DM-6 | `components/AuthBackground.tsx:40-44` | `tint="light"` is hardcoded and all auth screens use light-only text (`text-slate-900`, `text-slate-600`, `text-slate-500`, `bg-white/30` inputs). Auth is therefore **permanently light regardless of theme**. Given the fixed photographic background this is defensible, but it should be a stated decision, not an accident — a user in dark mode gets a full-brightness white-glass screen on launch. | Low (by design) |

### Screen by screen

| Screen | Finding | Severity |
| --- | --- | --- |
| `(tabs)/index.tsx` — Kiler | `:388` undo toast is `bg-slate-900` with no `dark:` variant. In dark mode a `#0F172A` toast floats on a `#0B1220` page with no border and no shadow — it nearly disappears as a surface. Fix: `dark:bg-[#1E293B]` + a `border-white/10`. | Medium |
| `(tabs)/index.tsx` | `:277,282,288` search icon / placeholder / clear icon are `#94a3b8` in both themes. Acceptable both ways (≈4.6:1 on dark, ≈2.6:1 on white — the *light* mode is the weaker one). | Low |
| `(tabs)/index.tsx` | `:316` sort-chip label correctly branches `isDark ? "#94a3b8" : "#475569"`. ✅ | — |
| `(tabs)/dashboard.tsx` | `:49` chevron `#cbd5e1` in both themes. On dark cards it's fine; on **white** cards in light mode it's ≈1.5:1 — effectively invisible. Same colour, same problem at `running-low.tsx:81`. This is the mirror-image of the usual dark-mode bug. | Medium |
| `(tabs)/dashboard.tsx` | `:174` the "Tahmini Tarihli" tile uses `#64748B` as *both* the big number colour and the 4 px accent bar. On `#151F2E` that's ≈3.4:1 — passes only because the number is large text. The other four tiles' colours (`#047857`, `#D97706`, `#14B8A6`, `#6366F1`) are also unbranched; `#047857` (brand green) as a **number** on a dark card is ≈2.4:1 and genuinely hard to read. | Medium |
| `(tabs)/upload.tsx` | `:328` empty-dropzone icon and `:329` `text-slate-400 dark:text-slate-500` — the dark variant is *darker* than the light one, which is backwards. Everything else on this screen is correctly paired. | Low |
| `(tabs)/upload.tsx` | `:263,271` deselected-row text uses `dark:text-slate-600` / `dark:text-slate-700` — near-invisible on `#151F2E`. Intentional "dimmed" state, but it crosses from "de-emphasised" to "unreadable". | Low |
| `(tabs)/recipes.tsx` | Fully paired (`dark:bg-[#151F2E]`, `dark:text-slate-400`, `dark:bg-amber-500/10` + `dark:text-amber-400`). The only unbranched value is the `#047857` link icon at `:92`. ✅ mostly clean. | Low |
| `score.tsx` | `:113` `InfoButton` correctly branches `dotColor` and background on `isDark`. ✅ `:290` the inline `#EF5A5A` "bozuldu" count shares DM-2's contrast problem. | Low |
| `settings.tsx` | `:95,117` list icons hardcoded `#6E7A8D` on `#151F2E` → ≈3.0:1. Same root cause as DM-1. | Medium |
| `settings.tsx` | `:131,133,135` the delete-account row uses `#EF5A5A` in both themes — here it's on a card and large enough to pass. `dark:border-red-500/20` is correctly paired. ✅ | — |
| `shopping-list.tsx` | `:261` trash icon `#94a3b8` unbranched (acceptable). `:206` sticky section header background is correctly paired to the page colour. ✅ | Low |
| `expiring-soon.tsx`, `product-list.tsx`, `upload-history.tsx`, `running-low.tsx` | All surfaces correctly paired. Only the shared `#047857` empty-state icon and `#cbd5e1` chevron are unbranched. ✅ | Low |
| `add-product.tsx`, `edit-product.tsx` | All surfaces correctly paired (`dark:bg-[#0B1220]`, `dark:bg-white/5`, `dark:border-white/10`). Only DM-3 (error text) applies. ✅ | — |
| `(auth)/*` | See DM-6 — light-only by design. | — |

### One theming bug worth its own line

**`context/ThemeContext.tsx:37-45` — theme flash on cold start.** `setColorScheme(initial)` runs only *after* an `await SecureStore.getItemAsync(...)`. Until that resolves, NativeWind is on `"system"`. A user whose OS is light but who chose **Dark** in Settings sees a white flash on every cold launch. `AppThemeProvider` renders `children` unconditionally, so there's nothing gating it. Fix: hold a `isThemeLoading` flag and return `null` (the splash is already held by `app/_layout.tsx:12`), or persist the preference to a synchronous store.

---

## UX Findings

### Critical

**UX-C1 — Pantry undo window does not survive a tab switch; items resurrect, then silently disappear.**
`(tabs)/index.tsx:180-206`

`handleSwipeAction` removes the product from local state optimistically and starts a 4-second `setTimeout` before issuing the real `DELETE`. But:
1. There is **no cleanup effect** clearing `pendingDeleteTimeout` and no commit-on-blur.
2. `useFocusEffect` (`:148-153`) re-fetches on every focus.

Reproduction: swipe a product → switch to Panel → switch back within 4 s. The refetch returns the product (the server hasn't been told yet), so **the "deleted" item reappears in the list while the "Geri Al" toast is still showing**. At t=4 s the timer fires, the server deletes it, and the row stays visible until the next refresh — at which point it vanishes with no explanation. The user's mental model is broken in both directions.

*Fix:* add a cleanup that commits (or cancels) the pending delete on blur/unmount, and filter `pendingDelete.product._id` out of any list produced by `loadProducts` while a delete is pending.

**UX-C2 — Shopping list gets permanently stuck on its error screen.**
`shopping-list.tsx:39-51`

`load()` never calls `setErrorMessage(null)` on the success path (compare `(tabs)/index.tsx:129` and `dashboard.tsx:74`, which both do). One transient failure latches `errorMessage` forever: every subsequent focus refetches successfully and updates `items`, but the render at `:196` still short-circuits to the error view. The only recovery is killing the app. There is also no "Tekrar dene" button on this screen.

*Fix:* `setErrorMessage(null)` at the top of `load()`.

### High

**UX-H1 — Three write paths fail completely silently.**

- `shopping-list.tsx:96-98` — `handleAddItem`'s `catch {}` is empty. User types a name, taps Ekle, the spinner flashes, and **nothing happens**. No item, no error, no explanation. The inline comment argues the user "doesn't lose their input", which is true but is not feedback.
- `running-low.tsx:63-64` — same empty `catch {}` on "Ekle to shopping list". The row simply doesn't disappear.
- `(tabs)/index.tsx:168-177` — a failed delete re-inserts the product via `console.warn` only. The user saw "tüketildi", the item comes back minutes later, and nothing explains why. (`console.warn` is invisible in a release build.)

*Fix:* a shared inline error banner or `Alert`. Minimum viable: set an `errorMessage` state and render it.

**UX-H2 — The app's core interaction is undiscoverable.**
`(tabs)/index.tsx:53-80`, empty state `:362-380`

Swipe-right = "Tükettim", swipe-left = "Bozuldu" is *the* mechanism that feeds the entire waste-score feature. Nothing anywhere teaches it. The empty state says only "Sağ alttaki + butonuyla ilk ürününü ekle veya bir fiş yükle." The score screen's own empty state (`score.tsx:325-328`) references the gesture — but a user only reaches that screen *after* they'd need to know it. There is no onboarding, no first-run coach mark, no hint row, no partially-open row on first render.

**UX-H3 — Keyboard covers the form in the manual-item bottom sheet.**
`(tabs)/upload.tsx:405-472`

This is the exact anti-pattern the auth screens were centralised to avoid, reintroduced elsewhere. A bottom-sheet `Modal` anchored with `justify-end` contains two `TextInput`s, a unit selector and the "Listeye Ekle" button, with **no `KeyboardAvoidingView`**. On iOS the keyboard will cover the quantity field, the unit row and the submit button entirely.

Related: `edit-product.tsx:144` — the whole screen is a bare `<View>` with a `TextInput` (`:159`) and the "Kaydet" button below it, no `KeyboardAvoidingView`. `add-product.tsx:58` *does* have one. Same modal presentation, opposite treatment.

*Verified good:* `AuthBackground.tsx:37-39` still has the correct single-point `flex-1 justify-center` KAV. The original fix has **not** been regressed in auth.

**UX-H4 — Android hardware back button cannot dismiss three of four modals.**
`upload.tsx:374`, `upload.tsx:405`, `edit-product.tsx:236` all omit `onRequestClose`. `score.tsx:352` has it. On Android, `Modal` without `onRequestClose` swallows the back gesture; combined with UX-H3 (submit button under the keyboard) the manual-item sheet can become a genuine dead end. Also, only `score.tsx` supports tap-outside-to-dismiss (`:353-356`).

**UX-H5 — Failed load on Edit Product shows an editable empty form.**
`edit-product.tsx:56-62, 143-234`

If `getProduct` fails, `errorMessage` is set but `isLoading` goes false and the component renders the **full form with blank name and quantity**, with the error text buried at `:220` between the date row and the Save button. Pressing Kaydet then PATCHes garbage. There is no error-state early return and no retry, unlike `(tabs)/index.tsx:265-271` and `score.tsx:249-255` which both have proper error views with "Tekrar dene".

### Medium

**UX-M1 — Notification storm and iOS 64-notification ceiling.**
`lib/notifications.ts:92-113, 148-157`

- `syncExpiryNotifications` schedules **4 notifications per product** (T-3, T-2, T-1, T-0). iOS hard-caps pending local notifications at **64**; from ~16 tracked products onward, notifications are silently dropped by the OS with no error. For a pantry app, 16 products is a normal week.
- `syncRunningLowNotifications` schedules **one notification per product at the identical trigger time** (`:138-146` computes a single `triggerDate` outside the loop). Five low-stock products = five buzzes in the same second. Should be one aggregated notification ("3 ürünün tükenmek üzere").
- `ensurePermission` (`:22-37`) never surfaces a denied-permission state to the user, and there is no notification toggle anywhere in Settings.

**UX-M2 — `syncExpiryNotifications` runs a full cancel-and-rebuild on every Kiler focus.**
`(tabs)/index.tsx:133-135`

Every focus does one `getAllScheduledNotificationsAsync`, N cancels, then up to 4N `scheduleNotificationAsync` awaits — all sequential (`for` + `await`, `:97-112`), all on the JS thread. With 30 products that's ~120 sequential bridge round-trips per tab focus. It won't block the UI thread but it will contend for the JS thread during the exact moment the user is scrolling a fresh list.

**UX-M3 — No empty state when the receipt OCR returns zero products.**
`(tabs)/upload.tsx:110-117, 240-316`

`setReviewItems([])` is truthy, so the review UI renders: an instruction line about unchecking items, a dashed "add manually" button, and a **"Seçilenleri Kilere Ekle (0)"** button. Nothing says "fişten hiçbir ürün okunamadı". Tapping the button then shows `"Kilere eklemek için en az bir ürün seç."` (`:179`) which is confusing when there was never anything to select.

**UX-M4 — No empty state when the AI returns zero recipes.**
`(tabs)/recipes.tsx:170-174`

`recipes.map(...)` over an empty array renders nothing. A user who taps "Kilerime Göre Tarif Öner" and gets no results sees the spinner stop and a blank white area, with no message. `hasSearched` is already tracked, so the fix is one branch.

**UX-M5 — Shopping-list delete is a one-tap, unconfirmed, un-undoable destructive action.**
`shopping-list.tsx:260-262`

An 18 px trash icon with `hitSlop={8}` (34 pt effective) deletes immediately. Compare the pantry, which has a full 4-second undo window for the same class of action, and Settings, which double-confirms. The three destructive flows in the app use three different safety levels.

**UX-M6 — Register form validates less than the reset-password form.**
`(auth)/register.tsx:19-22`

Only checks `!email || !password`. It does **not** validate: email format, minimum password length (the placeholder promises "en az 8 karakter" at `:70`), or that `name` is non-empty despite there being an "Ad Soyad" field that gets sent to the API at `:26`. Meanwhile `reset-password.tsx:27-35` correctly checks length *and* confirmation match. Users only learn about the 8-character rule from a server round-trip.

**UX-M7 — No autofill / password-manager support on any auth field.**
`login.tsx:72-90`, `register.tsx:48-75`, `reset-password.tsx:77-94`

No `textContentType`, no `autoComplete`, no `returnKeyType`/`onSubmitEditing` chaining between email → password, no show/hide password toggle. iOS Keychain and Android Autofill will not offer to fill or save credentials. On an app whose JWT expires every 7 days and force-logs-out, this is a recurring friction point.

**UX-M8 — Auth screens cannot scroll.**
`AuthBackground.tsx:36-47`

The glass card is a `BlurView` inside a `flex-1 justify-center` KAV, with no `ScrollView`. On a small device (SE-class, 568–667 pt) the register screen — 96 pt logo + 3 × 56 pt inputs + gaps + button + footer links — plus an open keyboard will clip content with no way to reach it.

**UX-M9 — No request timeout anywhere.**
`lib/api.ts:31-38`

`fetch` is called with no `AbortController` and no timeout. Against the hardcoded LAN IP (`lib/config.ts:5`), a user on a different Wi-Fi network gets a spinner that hangs for the platform default (often 60 s+) with no cancel affordance and no "check your connection" copy. There is also no offline detection anywhere in the app.

**UX-M10 — Pull-to-refresh is inconsistent.**
Present on `(tabs)/index.tsx:336,359` and `(tabs)/dashboard.tsx:131`. Absent on `expiring-soon.tsx`, `product-list.tsx`, `running-low.tsx`, `upload-history.tsx`, `shopping-list.tsx`, and `score.tsx` — all of which are pull-down lists where users will reflexively try it.

### Low

- **UX-L1 — Asymmetric empty states.** `(tabs)/index.tsx:339-348` (the category-grouped `SectionList`) shows only the "Kilerin boş görünüyor" heading; the `FlatList` branch at `:362-380` shows heading **plus** a helpful description. Same screen, different sort mode, different quality of empty state.
- **UX-L2 — Error states are inconsistently actionable.** "Tekrar dene" exists on `(tabs)/index.tsx:268` and `score.tsx:252`; it's missing on `dashboard.tsx:124-126`, `expiring-soon.tsx:43-45`, `product-list.tsx:60-62`, `running-low.tsx:90-92`, `upload-history.tsx:52-54`, `shopping-list.tsx:197-199`.
- **UX-L3 — Touch targets below 44 pt.** Sort chips `height: 34` (`index.tsx:308`); range pills `h-9` = 36 pt (`score.tsx:224`); search clear icon 18 px + hitSlop 8 = 34 pt (`index.tsx:287`); shopping-list trash 18 px + 8 = 34 pt (`:260`); review checkbox 24 pt + 8 = 40 pt (`upload.tsx:251-253`); shopping-list checkbox 24 + 8 = 40 pt (`:226`). `HeaderIconButton` (32 + hitSlop 8 = 48) and the FAB (56) are fine.
- **UX-L4 — Zero accessibility labels.** A repo-wide grep for `accessibility` returns exactly one hit: `AuthBackground.tsx:35`'s `accessible={false}` on the dismiss-keyboard `Pressable` (which is correct). Every icon-only control — the settings gear, the history clock, the FAB, the search clear, the shopping-list trash and checkbox, the info button, the mascot, the quantity steppers, every tab-bar item — is unlabelled. A VoiceOver/TalkBack user cannot operate this app.
- **UX-L5 — Fixed-height inputs will clip at large OS font sizes.** `height: 52` / `44` / `34` containers are used throughout (`add-product.tsx:70`, `upload.tsx:422`, `shopping-list.tsx:141`, `index.tsx:276`). Nothing sets `allowFontScaling={false}`, so text *will* scale while its container does not. At iOS "Larger Text" settings the labels will be cut off.
- **UX-L6 — Unhandled promise rejections.** `dashboard.tsx:94` (`syncRunningLowNotifications` not awaited and not `.catch()`ed — it escapes the enclosing `try`), `running-low.tsx:36` (same), `recipes.tsx:90` (`Linking.openURL` with no `.catch`). Compare `(tabs)/index.tsx:133-135`, which does it correctly.
- **UX-L7 — Loading pattern is good but leaves a blank frame.** `useDelayedLoading` (200 ms threshold) is a genuinely nice touch and is used on 8 screens. The consequence, though, is that on a slow-but-under-200 ms load the screen renders literally nothing — including, on Kiler, the search bar and sort chips, which unmount entirely during a non-silent load (`index.tsx:259-272`). A skeleton would be strictly better than a conditional blank.
- **UX-L8 — Redundant navigation after login.** `login.tsx:40` calls `router.replace("/(app)/(tabs)")` immediately after `signIn`, but `app/_layout.tsx:56-62`'s `Stack.Protected guard={!!token}` already performs the switch. Harmless today, but two systems driving the same transition.

---

## Code Quality Findings

### High

**CQ-H1 — Dead code: two files from the Expo starter template are never imported.**
- `src/constants/theme.ts` (65 lines) — exports `Colors`, `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth`. Grep confirms **zero** importers. Worse, it does `import '@/global.css'` at line 6 as a side effect, and it defines a *third*, contradictory colour system (`#000000`/`#ffffff` backgrounds) alongside `tailwind.config.js` and the inline hexes.
- `src/components/external-link.tsx` (25 lines) — zero importers; the only thing keeping `expo-web-browser` in the dependency tree.

Both should be deleted. In a thesis repo, dead template files are the first thing a reviewer will read as "not actually written by the author".

**CQ-H2 — Side effect in a render body.**
`app/_layout.tsx:46-48`

```tsx
if (!isLoading) {
  SplashScreen.hideAsync();
}
```

This fires on *every* render of `RootNavigator`, not once. `hideAsync()` is idempotent, so it doesn't break — but it is exactly the pattern React 19 + the React Compiler (`app.json` has `"reactCompiler": true`) is designed to punish, and it will produce unhandled-rejection warnings once the splash is already hidden. Belongs in a `useEffect`.

**CQ-H3 — `categorize.ts` keyword matching has two real defects.**
`lib/categorize.ts:30,33,37,39,46`

1. **`"bisküvi"` can never match.** The comparison at `:43` folds the product name to ASCII via `toAsciiLower`, but the keyword literal at `:37` still contains a Turkish `ü`. `"Bisküvi"` → `"biskuvi"`, which never `.includes("bisküvi")`. Dead keyword. (Pinned by a test.)
2. **Unbounded substring matching on 2-letter keywords.** `"et"`, `"un"`, `"su"` are matched with `.includes()` and no word boundary. Verified misfires: `Deterjan` → **Et & Tavuk**, `Peçete` → **Et & Tavuk**, `Sabun` → **Bakliyat & Tahıl**, `Susam` → **İçecek**. Since receipt OCR feeds arbitrary product names straight into this function, non-food items *will* land in food categories on the Kiler grouping, the shopping list grouping, and the waste-score category breakdown.

*Fix:* match on word boundaries (`new RegExp(\`\\b${kw}\\b\`)` over the folded string) and ASCII-fold the keyword table itself at module load so the two sides can't drift again.

### Medium

**CQ-M1 — Duplicated tier logic that can silently drift.**
`components/LyxMascot.tsx:9-16` defines `moodTierForScore` (`≤20 kritik / ≤40 dusuk / ≤60 orta / ≤80 iyi / else harika`). `score.tsx:53-60` defines `scoreLabel` with the **same five boundaries** hardcoded again, and `score.tsx:34-38`'s `MOOD_LEGEND` hardcodes the ranges a **third** time as display strings (`"0-20"`, `"21-40"`, …). Change a boundary in one place and the mascot, the label and the legend disagree. Should be a single exported table of `{ tier, max, label, range }`.

**CQ-M2 — Copy-pasted screen scaffolding across six list screens.**
`expiring-soon.tsx`, `product-list.tsx`, `running-low.tsx`, `upload-history.tsx`, `shopping-list.tsx`, and both branches of `(tabs)/index.tsx` each re-implement the identical `isLoading ? (showSpinner ? <Spinner/> : null) : errorMessage ? <ErrorView/> : <FlatList .../>` ladder, plus a near-identical empty-state block (`w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10` + Ionicon + heading + description). That's ~6 copies of ~35 lines. Extracting `<ScreenState>` and `<EmptyState icon title description>` components would remove ~200 lines *and* would have prevented UX-L1 and UX-L2 (the inconsistencies exist precisely because these are copies, not a component).

The product row itself is duplicated four times too — `expiring-soon.tsx:64-76`, `product-list.tsx:81-93` and the read-only half of `(tabs)/index.tsx:81-100` are the same card markup.

**CQ-M3 — `FlatList`/`SectionList` performance hygiene.**
`(tabs)/index.tsx:328-330, 356-358` — `renderItem` is an inline arrow, recreated every render, and `ProductRow` is **not** `React.memo`'d. Every keystroke in the search box (`:280`) re-renders the whole list body, and each row mounts a `Swipeable` with two inline `renderLeftActions`/`renderRightActions` closures (`:57-80`) — the most expensive row component in the app. Same pattern in `shopping-list.tsx:224-264` and `expiring-soon.tsx:64-76`.
`keyExtractor` is correctly provided everywhere (`item._id` / `item.productId`) — good. Nothing sets `getItemLayout`, `removeClippedSubviews`, or `initialNumToRender`; not urgent at expected list sizes, but the memoisation is worth doing.

**CQ-M4 — TypeScript: two places where types claim more than runtime guarantees.**
- `edit-product.tsx:51` — `setUnit(product.unit as (typeof UNITS)[number])`. The API types `Product.unit` as plain `string` (`api.ts:108`). If the backend ever returns `"gr"` or `"paket"`, no unit chip renders selected and saving silently coerces the unit. Should be a runtime guard: `UNITS.includes(u) ? u : "adet"`.
- `product-list.tsx:25` — `useLocalSearchParams<{ filter: Filter }>()` asserts the param is always a valid `Filter`, but route params are `string | undefined` at runtime. `TITLES[filter]` (`:52`) and `EMPTY_MESSAGES[filter]` (`:77`) would both be `undefined` if the screen were ever reached without the param (deep link, state restoration). Needs a fallback.

Positives worth recording: **no `any`, no `as any`, no `@ts-ignore`/`@ts-expect-error`, `strict: true`**, and the only three `!` assertions (`index.tsx:239`, `shopping-list.tsx:66`, `wasteScoreBuckets.ts:88`) are all immediately preceded by the code that guarantees the key exists. `recipes.tsx:90`'s `recipe.sourceLink!.url` is inside a `recipe.sourceLink ?` guard — safe, but would be cleaner captured in a local const. The one unavoidable cast, `api.ts:228`'s `as unknown as Blob` for React Native's `FormData` file shape, is correctly documented.

**CQ-M5 — Defensive gap: a malformed date crashes the score screen.**
`lib/wasteScoreBuckets.ts:49-51, 62-64, 72-73`

`new Date(event.createdAt)` with an unparseable string yields `NaN` for `getDay()`/`getDate()`/`getMonth()`, so the index is `NaN`, `buckets[NaN]` is `undefined`, and `addToBucket(undefined, event)` throws — taking down `score.tsx` render with no error boundary anywhere in the app. Backend-controlled today, so low probability, but there is no `ErrorBoundary` in the tree at all.

**CQ-M6 — Configuration is hardcoded into source.**
`lib/config.ts:5` — `export const API_BASE_URL = "http://192.168.1.113:4000/api";`

A machine-specific private IP over cleartext HTTP, committed to git. The file comment acknowledges it and says "update this when the Wi-Fi changes", which is honest but not shippable. Should read `process.env.EXPO_PUBLIC_API_URL` with this as the dev fallback. Also worth noting for the thesis write-up: cleartext HTTP means the JWT travels unencrypted on the LAN.

### Low

- **CQ-L1 — Dependency bloat.** Grep confirms **zero** imports of: `@expo/ui`, `expo-glass-effect`, `expo-symbols`, `expo-font`, `expo-device`, `expo-linear-gradient`, `expo-system-ui`, `react-native-svg`, `expo-constants`. `expo-web-browser` is reachable only through the dead `external-link.tsx`. `react-dom` + `react-native-web` are only needed for the `web` script. That is ~10 removable dependencies. (`react-native-reanimated` / `react-native-worklets` are required peers of `react-native-gesture-handler`; keep them.)
- **CQ-L2 — Unused asset payload.** `assets/images/` still ships `react-logo.png`, `react-logo@2x.png`, `react-logo@3x.png`, `expo-logo.png`, `expo-badge.png`, `expo-badge-white.png`, `tutorial-web.png`, plus an empty `assets/tabIcons/` directory and an unreferenced `logo-glow.png`.
- **CQ-L3 — Blur that does nothing.** `(tabs)/_layout.tsx:42-43` — a `BlurView intensity={50}` immediately covered by `rgba(12,22,36,0.92)`. Pay the GPU cost or drop the component.
- **CQ-L4 — Naming inconsistency in the API layer.** `lib/api.ts` mixes `{ message, products }`, `{ message, items }`, `{ message, receipts }` envelope shapes and one bare payload (`getDashboardSummary` at `:168-170` returns the summary with no envelope). Consumers therefore destructure differently on every screen. Backend-driven, but worth a normalising wrapper.
- **CQ-L5 — Magic numbers duplicated across the boundary.** `components/ExpireBadge.tsx:6` re-declares `EXPIRING_SOON_DAYS = 3` to mirror `receipt-ai/config.js`. The comment flags it. Low risk, but it is a silent-divergence hazard exactly like CQ-M1.
- **CQ-L6 — `AuthContext.tsx:75-82` registers the 401 handler with an empty dep array and an eslint-disable.** The reasoning in the comment is correct (the closure only touches setters), but `signOut` is recreated every render, so the registered closure is permanently the first-render one. It happens to be safe; a `useCallback` on `signOut` would make it provably so.
- **CQ-L7 — `(tabs)/index.tsx:214-232`'s `visibleProducts` memo silently ignores `sortBy === "category"`.** It's correct (that mode routes to `groupedSections`), but the switch has no `category` case and no comment, so a future reader will assume it's a missing branch.
- **CQ-L8 — Commented-out code / TODOs: none found.** Grep for `TODO`, `FIXME`, `console.log` returns nothing. Only two intentional `console.warn` calls (`index.tsx:134,174`). Clean.

---

## Test Coverage Added

### What was set up

`jest` + `ts-jest` + `@types/jest` (all pinned to the **29.x** line — jest 30 conflicts with the `jest-mock@29.7.0` that `react-native@0.81` hoists, producing `TypeError: this._moduleMocker.clearMocksOnScope is not a function`; 29.x resolves cleanly).

New files:

| File | Purpose |
| --- | --- |
| `client/jest.config.js` | ts-jest preset, `node` environment, `@/*` path mapping, `react-native`/`expo-router` stub mapping |
| `client/test/stubs/react-native.js` | Minimal host-component stub (see below) |
| `client/test/stubs/expo-router.js` | Minimal `router` stub |
| `client/src/lib/__tests__/turkish.test.ts` | 6 tests |
| `client/src/lib/__tests__/categorize.test.ts` | 7 tests |
| `client/src/lib/__tests__/wasteScoreBuckets.test.ts` | 9 tests |
| `client/src/components/__tests__/pureHelpers.test.ts` | 10 tests |

`client/package.json` gained a `"test": "jest"` script. **No existing source file was modified.**

React Native Testing Library was deliberately *not* added, per the audit brief — full component rendering needs a large native mock surface for little signal on this codebase.

### Why these four files

| Module | Why it's worth testing |
| --- | --- |
| `lib/turkish.ts` | The project has had real production bugs from plain `.toLowerCase()`. This is the single highest-risk pure function in the app and every category/ingredient match depends on it. |
| `lib/categorize.ts` | Drives Kiler grouping, shopping-list grouping and the waste-score category breakdown. Pure, boundary-heavy, and — as the tests document — currently buggy. |
| `lib/wasteScoreBuckets.ts` | Four distinct bucketing strategies with off-by-one-prone index math (`(getDay()+6)%7`, `floor((date-1)/7)`, dynamic week count, year grouping). Exactly the code that breaks silently. |
| `components/ExpireBadge.ts`'s `daysUntil` + `components/LyxMascot.tsx`'s `moodTierForScore` | Both are pure and both are *stated* to have been the subject of a past bug-fix (calendar-day vs rolling-24h). They live in `.tsx` files next to components, so `react-native`/`expo-router` are stubbed — the components themselves are never rendered or invoked. |

**Skipped, with reasons:** `lib/lyxMoodImages.ts` is only `require()`d PNG paths — nothing to assert without a Metro asset transformer. `lib/notifications.ts`'s only pure helper is a 3-line `capitalize` that is not exported; testing it would require changing the source, which the audit brief forbids. `lib/api.ts` is I/O and `lib/useDelayedLoading.ts` is a hook (needs a React renderer).

### Edge cases actually covered

- **Turkish casing:** that `"İ".toLowerCase() !== "i"` in plain JS (the actual historical bug), that both `İ` and dotless `I` fold to ASCII `i`, full `ıŞĞÜÖÇ` coverage, the absence of leftover combining marks after NFD, idempotency, and preservation of digits/spacing.
- **Categorisation:** happy paths, `ALL CAPS` receipt input, keywords embedded in longer names, unknown-product and empty-string fallback to `"Diğer"`, first-match-wins precedence when a product hits two categories (`Sucuk`, `Tereyağı`) — **plus two tests that deliberately pin the current buggy behaviour** (`Deterjan`/`Peçete`/`Sabun`/`Susam` misclassification; the unreachable `"bisküvi"` keyword), each labelled `KNOWN BUG` and cross-referenced to this report so they turn red the moment someone fixes CQ-H3.
- **Score buckets:** deterministic via `jest.setSystemTime(2025-01-15)`. Monday-index-0 / Sunday-index-6 conversion, consumed-vs-expired counting with raw event retention, dynamic week count for a 31-day month, the day-7/day-8 week boundary, end-of-month clamping, 12-month year labels, the "no data → single current-year bucket" fallback, and ascending multi-year grouping.
- **Mood tiers:** `null` → `"orta"`, all five inclusive upper boundaries (20/40/60/80/100), the one-point-past flip at each, fractional scores just past a boundary (20.0001, 80.5 — relevant because the backend returns unrounded scores and only `score.tsx:261` rounds for display), and out-of-range (−10, 999).
- **`daysUntil`:** `null` input, same-day at 00:01 and 23:59 → 0, **the calendar-vs-rolling-24h distinction** (a target 45 minutes away but on the next calendar date returns 1, not 0 — this is the regression test for the documented past bug), negative counts for expired items, and forward counting across a month boundary.

### How to run / result

```bash
cd client
npx jest          # or: npm test
```

```
PASS src/lib/__tests__/categorize.test.ts
PASS src/lib/__tests__/turkish.test.ts
PASS src/lib/__tests__/wasteScoreBuckets.test.ts
PASS src/components/__tests__/pureHelpers.test.ts

Test Suites: 4 passed, 4 total
Tests:       32 passed, 32 total
```

**All 32 tests pass.** Verified via both `npx jest` and `npm test`.

---

## Missing Features / Gaps

Real gaps a user would notice, not scope creep:

1. **First-run onboarding.** The swipe-to-consume / swipe-to-expire gesture is the app's core mechanic and is taught nowhere (see UX-H2). Even a one-time hint row or a pre-opened first swipe row would close this.
2. **Notification controls.** Notifications are scheduled unconditionally from two screens with no toggle, no quiet hours, no per-type opt-out, and no visible state when the OS permission was denied (`lib/notifications.ts:22-37` silently no-ops). Settings has a theme section and a danger zone but nothing for the one feature that interrupts the user.
3. **Accessibility settings and instrumentation.** No labels at all (UX-L4), and fixed-height inputs that will clip under OS font scaling (UX-L5). Neither a screen-reader user nor a large-text user can use this app today.
4. **Offline / connectivity awareness.** Every screen assumes the network works; combined with no request timeout (UX-M9) and a hardcoded LAN IP, "wrong Wi-Fi" presents as an infinite spinner.
5. **Filtering in the pantry, not just sorting.** `(tabs)/index.tsx` has search + 4 sorts but no way to filter to "expiring soon", "expired", or a single category — even though `categorize.ts` and `ExpireBadge` already compute exactly those groupings.
6. **Product rename.** `edit-product.tsx` shows the name as a read-only heading (`:145-147`) and never sends `name` in the PATCH (`:98-102`), even though `updateProduct` supports it (`api.ts:143`). Receipt OCR produces garbled names often enough that this matters.
7. **Bulk actions on the shopping list.** No "clear checked", no "move checked items into the pantry" — which is the natural end of the shopping loop and would close the app's core cycle (running low → list → shop → pantry).
8. **Undo parity for destructive actions.** The pantry has a 4 s undo; the shopping list has none (UX-M5). Users learn the affordance in one place and lose data in another.
9. **Account management.** Settings offers theme, sign out, and account deletion. No change password, no change email, no "signed in as {email}" display — the `user` object is in `AuthContext` and never rendered anywhere in the app.
10. **App metadata.** No version string, no about/licence screen, no privacy statement — the last of which is a real requirement given the app uploads photographs of receipts to an AI service.
11. **No error boundary.** A render-time throw anywhere (e.g. CQ-M5) takes down the whole tree with a red screen in dev and a blank/crash in production.
12. **Product history.** Consumption events exist server-side (they drive the waste score) but there is no per-product view of them — a "you've bought this 6 times" view is the obvious payoff of the data already being collected.

Explicitly **not** flagged as gaps (out of scope for this project): barcode scanning, multi-user/household sharing, price tracking, meal planning, i18n beyond Turkish.

---

## Prioritized Recommendations

### Must-fix (correctness and data integrity — do these before any demo or release)

1. **UX-C1** — Clear/commit `pendingDeleteTimeout` on blur+unmount and exclude pending-delete IDs from refetch results. `(tabs)/index.tsx:180-206`. *Items currently resurrect and then silently vanish.*
2. **UX-C2** — Add `setErrorMessage(null)` at the top of `load()`. `shopping-list.tsx:39-51`. *One-line fix for a permanently stuck screen.*
3. **UX-H1** — Replace the three empty `catch {}` blocks with visible error UI. `shopping-list.tsx:96`, `running-low.tsx:63`, `(tabs)/index.tsx:168-177`.
4. **CQ-M6** — Move `API_BASE_URL` to `process.env.EXPO_PUBLIC_API_URL` with the LAN IP as a dev fallback, and plan for HTTPS. `lib/config.ts:5`.
5. **UX-H3** — Wrap the manual-item bottom sheet in a `KeyboardAvoidingView` and add one to `edit-product.tsx`. `upload.tsx:405`, `edit-product.tsx:144`. *Submit buttons are currently unreachable under the keyboard.*
6. **UX-H4** — Add `onRequestClose` to the three modals missing it. `upload.tsx:374,405`, `edit-product.tsx:236`.
7. **CQ-H3** — Fix `categorize.ts`: ASCII-fold the keyword table and use word boundaries. `lib/categorize.ts:30-46`. *Two tests already pin the current wrong behaviour and will flip green.*
8. **UX-M1** — Cap expiry notifications (drop to 2 steps per product, or prioritise the soonest ~15 products) and aggregate running-low into one notification. `lib/notifications.ts:64-72, 148-157`. *iOS silently drops past 64 pending.*

### Should-fix (quality, consistency, accessibility — the difference between "works" and "shippable")

9. **UX-L4** — Add `accessibilityLabel` + `accessibilityRole="button"` to every icon-only control (~15 sites). Highest ratio of user impact to effort in this list.
10. **DM-1 / DM-2 / DM-3** — Fix the three dark-mode contrast failures: `HeaderIconButton`'s default colour, `ExpireBadge`'s status colours, and the eight `text-red-600` error strings. `HeaderIconButton.tsx:7`, `ExpireBadge.tsx:30-41`, plus the eight files listed in DM-3.
11. **UX-H5** — Early-return an error view with retry from `edit-product.tsx` instead of rendering a blank editable form. `:56-62`.
12. **CQ-M2** — Extract `<ScreenState>` and `<EmptyState>` components; delete ~200 duplicated lines across six screens. This structurally prevents UX-L1 and UX-L2 from recurring.
13. **CQ-H1** — Delete `src/constants/theme.ts` and `src/components/external-link.tsx`; drop the ~10 unused dependencies (CQ-L1) and the template assets (CQ-L2).
14. **DL-1 / DL-2** — Pick one page background (`bg-surface`) and one text vocabulary (`text-ink`/`text-ink-muted`), then sweep all screens.
15. **UX-H2** — Add first-run onboarding for the swipe gesture. The single highest-impact *product* change in this list.
16. **UX-M6 / UX-M7** — Add client-side email/password/name validation to register, and `textContentType`/`autoComplete`/`returnKeyType` to all auth inputs.
17. **UX-M3 / UX-M4** — Real empty states for "receipt parsed 0 products" and "AI returned 0 recipes".
18. **CQ-H2** — Move `SplashScreen.hideAsync()` into a `useEffect`. `app/_layout.tsx:46-48`. Required for React Compiler correctness.
19. **UX-M9** — Add an `AbortController` timeout (~15 s) to `apiRequest` with friendly Turkish copy for timeouts. `lib/api.ts:31-38`.
20. **DM-7 (ThemeContext flash)** — Gate `AppThemeProvider`'s children on the stored-preference read. `context/ThemeContext.tsx:37-45`.
21. **CQ-M1** — Collapse the three duplicated score-tier tables into one exported source of truth.
22. **DL-7** — Set the real app `name`/`slug`/`scheme` and brand the splash/adaptive-icon colours. `app.json`.

### Nice-to-have (polish and future work)

23. **UX-M5** — Confirmation or undo on shopping-list delete, matching the pantry's affordance.
24. **UX-M10 / UX-L2** — Pull-to-refresh and "Tekrar dene" on the six screens missing them.
25. **CQ-M3** — `React.memo` on `ProductRow`, hoist the `renderItem` closures, hoist the swipe-action renderers.
26. **UX-L3 / UX-L5** — Raise sub-44 pt targets; make fixed-height inputs `minHeight` so they grow with font scale.
27. **CQ-M4 / CQ-M5** — Runtime guards for `product.unit` and the `filter` route param; add a root `ErrorBoundary`.
28. **DL-4 / DL-3** — Replace the three hand-rolled glyphs with Ionicons; make the tab-bar blur either visible or absent.
29. **Missing features 2, 5, 6, 7, 9** — notification controls, pantry filtering, product rename, shopping-list bulk actions, account management.
30. **Extend the test suite** — the harness is now in place, so `useDelayedLoading` (with `@testing-library/react-hooks`) and `lib/api.ts`'s error mapping (with a `fetch` mock) are the cheapest next wins.

---

*Report generated as part of a pre-defence external code review. Only test files, `jest.config.js`, `test/stubs/*`, the `package.json` test script/devDependencies, and this document were created or modified; no application source file was changed.*
