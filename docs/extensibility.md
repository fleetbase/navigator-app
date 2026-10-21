# Extensibility

A client build changes what the app *does* — replaces or wraps screens and components, adds screens, tabs and Account menu entries — in one typed file, `brand/navigator.extensions.ts`, without editing upstream code. Visual options (colours, type, tabs, hidden menu entries) are branding: [branding.md](branding.md). The client-build layout and upgrade flow is in [client-builds.md](client-builds.md).

| Mechanism | Where | What it does |
|---|---|---|
| Screen overrides | `screens` | Replace a screen by its stable id; the override can wrap the default |
| Screen variants | `screens[id].variants` + `screenVariants` (or branding `screens`) | Choose among compiled-in alternatives declaratively |
| Component overrides | `components` | Replace one of a short list of components by its stable id |
| Custom routes | `routes` | Add screens to the tab stacks |
| Custom tabs | `tabs` | Add a tab that opens a custom route |
| Account menu entries | `accountLinks` | Add entries to the Account menu |
| Error reporting | `onError` | Receive every failure the app recovered from |
| Copy | `brand/translations/<locale>.json` | Replace or add strings (deep-merged over the app's) |

**The app never downloads or executes code from an API.** Everything here is compiled into the build; declarative configuration (branding) can only *select* what is already compiled in.

## Example

```ts
// brand/navigator.extensions.ts
import { defineNavigatorExtensions } from '../src/v3/extensions/define';
import { RewardsIcon } from './icons';

export default defineNavigatorExtensions({
    schemaVersion: 1,
    screens: {
        'order.detail': { load: () => import('./screens/OrderDetail') },
        'today.home': { load: () => import('./screens/Today'), variants: { compact: () => import('./screens/TodayCompact') } },
    },
    screenVariants: { 'today.home': 'compact' },
    components: {
        'orders.orderCard': { load: () => import('./components/OrderCard') },
    },
    routes: {
        Rewards: { load: () => import('./screens/Rewards'), titleKey: 'Brand.rewards', tabs: ['Account', 'RewardsTab'] },
    },
    tabs: {
        RewardsTab: { initialRoute: 'Rewards', icon: RewardsIcon, labelKey: 'Brand.tabs.rewards' },
    },
    accountLinks: [{ route: 'Rewards', labelKey: 'Brand.rewards' }],
    onError: (error, { id, source }) => Sentry.captureException(error, { extra: { id, source } }),
});
```

Load screens and components with `() => import(...)`. A lazy loader is what lets a brand file import the app's own modules (`../src/v3/ui`, the data hooks) without an import cycle, because the app is still loading when the extensions file is read. Keep the extensions file itself light: import icons and types, not screens.

## Replacing a screen

```tsx
// brand/screens/OrderDetail.tsx
import type { NavigatorScreen } from '../../src/v3/extensions';
import { Banner } from '../../src/v3/ui';

const OrderDetail: NavigatorScreen<'order.detail'> = ({ route, navigation, DefaultScreen }) => (
    <>
        <Banner tone="brand" message={`Order ${route.params?.orderId}`} />
        <DefaultScreen route={route} navigation={navigation} />
    </>
);

export default OrderDetail;
```

An override receives React Navigation's `{ route, navigation }`, with `route.params` typed per screen id (`ScreenParamMap`), plus `DefaultScreen`, the app's own implementation, to wrap or compose. No navigator changes are needed: the route name, the title bar and back control, and how the screen is reached all stay the same. To read session values, use the same hooks the app's screens use (`useDriverId`, `useFeatures`, `useOrganization`, `useSignOut` from `src/v3/navigation`) and the data hooks (`src/v3/data`).

- **Variants** — an entry's `variants: { key: loader }`, selected by `screenVariants: { id: key }` or by branding `screens: { id: { variant: key } }`; the extensions file wins over branding. An override keeps the default's variants unless it declares the same key. An unknown key falls back to the override, or the default, with a warning.
- **Platforms** — `platforms: ['ios']` or `['android']` limits an entry to that platform. Platform files (`.ios.tsx`, `.android.tsx`) resolve as usual too.

### Screen ids

| Id | Route | Params |
|---|---|---|
| `today.home` | TodayHome | — |
| `navigation.handoff` | NavigationHandoff | `destination?`, `orderId?` |
| `route.home` | RouteHome | — |
| `route.stopDetail` | StopDetail | `manifestId?`, `stopId?` |
| `route.stopExecution` | StopExecution | `manifestId?`, `stopId?` |
| `route.optimise` | OptimisePreview | `manifestId?` |
| `orders.list` | OrdersHome | — |
| `order.detail` | OrderDetail | `orderId?` |
| `order.entityDetail` | EntityDetail | `orderId?`, `entityId?`, `entity?` |
| `order.editPayloadItem` | EditPayloadItem | `orderId?`, `entity?` |
| `order.timeline` | OrderTimeline | `orderId?` |
| `order.proof` | ProofCapture | `orderId?`, `activityCode?`, `activityLabel?`, `podMethod?`, `expected?` |
| `order.destination` | Destination | `orderId?` |
| `offers.list` | Offers | — |
| `inbox.list` | InboxHome | — |
| `inbox.conversation` | Conversation | `channel?`, `channelId?` |
| `inbox.newConversation` | NewConversation | — |
| `account.home` | AccountHome | — |
| `account.profile` | ProfileEdit | — |
| `account.orgSwitcher` | OrgSwitcher | — |
| `account.settings` | Settings | — |
| `account.help` | Help | — |
| `account.syncQueue` | SyncQueue | — |
| `account.documents` | Documents | — |
| `account.earnings` | Earnings | — |
| `fuel.log` | FuelLog | — |
| `fuel.report` | FuelReport | `report?`, `previous?` |
| `fuel.create` | FuelReportCreate | `last?`, `currency?` |
| `issues.list` | Issues | — |
| `issues.detail` | IssueDetail | `issue?` |
| `issues.create` | IssueCreate | — |
| `vehicle.mine` | MyVehicle | — |
| `vehicle.trailer` | TrailerDetail | `trailerId?`, `trailer?` |
| `vehicle.change` | ChangeVehicle | `currentVehicleId?` |
| `inspection.start` | Inspection | `formId?`, `vehicleId?`, `vehicleName?`, `form?`, `afterSwap?` |
| `inspection.checklist` | InspectionChecklist | as `inspection.start` |
| `inspection.review` | InspectionReview | as `inspection.start` |
| `inspection.result` | InspectionResult | `submission?`, `vehicleName?`, `unsafe?` |
| `inspection.detail` | InspectionDetail | `submissionId?`, `submission?` |

**Not overridable:** the permissions primer (it carries the store-mandated background-location disclosure) and the pre-auth flow's connection and one-time-code screens. The sign-in screen is a component (`auth.signIn`).

## Replacing a component

```tsx
// brand/components/OrderCard.tsx
import type { NavigatorComponent } from '../../src/v3/extensions';

const OrderCard: NavigatorComponent<'orders.orderCard'> = ({ Default, ...props }) => <Default {...props} summary={props.customerName} />;

export default OrderCard;
```

An override receives exactly the default's props (`ComponentPropsMap`) plus `Default`. With no override the app renders its own component directly — a slot costs nothing until it is used. While an override loads, and if it fails to load or throws, the default renders with the same props.

| Id | Component | Props |
|---|---|---|
| `auth.signIn` | The sign-in screen | `SignInScreenProps` |
| `shell.appHeader` | The header above every tab | `AppHeaderProps` |
| `shell.tabBar` | The bottom tab bar | React Navigation's `BottomTabBarProps` + `badges` |
| `orders.orderCard` | An order in the Orders and Today lists | `OrderCardProps` |
| `route.stopRow` | A stop in a route manifest | `StopRowProps` |

The list is deliberately short — the parts a white-label build most often wants as its own. Anything else is changed through branding, or by overriding the screen that renders it. Ask upstream for a new id rather than forking a component.

## Custom routes, tabs and menu entries

- **Routes** (`routes.<Name>`): PascalCase, never a core route name (a clash is rejected — override the core screen instead). `tabs` lists the stacks the route is added to (core tab names or custom tab names; default every stack) — `navigate` resolves within the current stack, so list every tab it is opened from. `titleKey` gives the route the app's title bar and back control; without one the screen draws its own. `presentation: 'modal'` presents it over the current screen. A route that fails to load or render shows an error state.
- **Tabs** (`tabs.<Name>Tab`): open a custom route (`initialRoute`). `icon` is a render function `({ color, size, focused }) => …` — match the app's set: 24×24, 2px stroke, no fill. `labelKey` (a translation key) or `label`. Placement: branding `navigation.tabs` when it names the tab, else `position`, else just before Account. `initial: true` opens the app on it. The tab bar is designed for at most five tabs: hide a core tab with branding `navigation.tabs` to make room.
- **Account menu entries** (`accountLinks`): `{ route, labelKey, position? }`, opening a route in the Account stack (a custom route whose `tabs` include Account or are omitted, or a core one). They go just before Settings unless `position` says otherwise. Hide core entries with branding `account.hiddenLinks`.

## Failure behaviour

- An override (screen or component) that fails to load, has no component as its default export, or throws while rendering falls back to the default with the same props. If a screen's default fails too, an error state renders. New route params give a failed screen another try.
- Every recovered failure goes to `onError(error, { id, source })` (default: `console.error`).
- In development an unknown id, a malformed entry, an invalid route or tab name, or a menu entry for an unreachable route throws at startup, so it is found immediately. In a release build it is dropped with a warning.
- CI checks the build's extensions: `src/v3/branding/__tests__/bundled-brand.test.ts` validates them, and `yarn typecheck` checks `brand/**` against the public types.

## Rules for contributors

- Navigators register `screenSlot(id)`, never an overridable screen module. `src/v3/extensions/__tests__/boundaries.test.ts` enforces it, deriving the protected modules from the registry's defaults rather than a hand-kept list.
- A new screen: add its id to `screens/screen-ids.ts`, its params to `screens/params.ts`, its default to `screens/default-screens.ts`, register `screenSlot(id)` in the navigator, and add it to the table above.
- A new component slot: add the id to `components/component-ids.ts` and its props to `components/types.ts`, wrap the component with `componentSlot(id, Base)` where it is defined, and add it to the table above.
- **Screen ids, component ids, params and props are a public contract.** Don't rename or remove one — add a new one. A change to any of them is called out in the release notes.
