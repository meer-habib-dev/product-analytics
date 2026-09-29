# Event conventions

There is one generic event model. Logins, purchases, screens and button taps are all events; there are no per-type tables.

## Naming custom events

Use `snake_case`, in `object_action` form, with the verb in the past tense:

```
app_opened            onboarding_started      onboarding_completed
feature_used          paywall_viewed          plan_selected
checkout_started      subscription_started    message_sent
call_started
```

Guidelines:

- Name the thing that happened, not the UI element: `plan_selected`, not `yearly_button_tapped`.
- Put variants in properties, not names: `feature_used { feature: "voice_note" }`, not `voice_note_feature_used`.
- Keep names stable. Renaming an event splits its history.
- Use the same name across all your apps for the same concept, so funnels look alike.

Ingestion accepts `[A-Za-z][A-Za-z0-9_ .:-/]*` up to 128 characters. The SDK logs a debug warning when a name isn't snake_case.

## Reserved events

Names starting with `$` are reserved for the SDK. `track("$anything")` is refused client-side, and ingestion only accepts these:

| Event | Sent by | Properties |
| --- | --- | --- |
| `$screen` | `analytics.screen(name, props?)` | `name`, plus your props |
| `$identify` | `analytics.identify(id, traits?)` | traits, stored on the person |
| `$error` | `analytics.error(err, props?)` and uncaught errors | `name`, `message`, `stack`, `fatal`, `screen`, plus your props |
| `$session_start` | SDK, at the start of each session | none |
| `$session_end` | SDK, on reset or detected timeout | `reason` |

## Properties

- Values are flat primitives: `string | number | boolean | null`. The SDK converts `Date` to an ISO string and objects/arrays to JSON strings, and drops `undefined`, `NaN` and functions.
- Keys match `[A-Za-z][A-Za-z0-9_]*`, up to 64 characters. The SDK normalizes other keys (`"Plan Type"` becomes `Plan_Type`).
- Limits: 100 properties per event, strings up to 1,024 characters (error `stack` up to 8 KB), and 16 KB of properties per event.
- Never put secrets, tokens, passwords, message bodies or form contents in properties.

## Automatic context

Every event carries `context`: `platform, appVersion, buildNumber, osVersion, deviceModel, locale, timezone, sdkVersion, screen`. You never pass these yourself.

## Ingestion limits

| Limit | Value |
| --- | --- |
| Request body | 512 KB |
| Events per request | 100 (the SDK sends up to 50) |
| Event age | ≤ 30 days old, ≤ 5 minutes in the future after clock-skew correction |
| ID length (event, anonymous, distinct, session) | 200 printable ASCII characters, no whitespace |

Rejected events are reported per event, with a reason (`invalid_event_name`, `reserved_event_name`, `invalid_properties`, `properties_too_large`, `timestamp_out_of_range`, `invalid_id`, `invalid_context`, `invalid_event`, `duplicate_in_batch`).
