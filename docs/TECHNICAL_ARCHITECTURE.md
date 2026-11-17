# JAMROOM — Technical Architecture Document (Audited & Hardened)

## 1. Architecture Overview & High-Level Topology

JAMROOM is architected as a decoupled, event-driven web application comprising a modern Single-Page Application (SPA) frontend, an enterprise-grade PostgreSQL database with Supabase Managed Services, and the YouTube Client/Data APIs.

The system emphasizes:
- **Zero Client Trust**: All permissions, transitions, and queue positions are computed and validated by PostgreSQL stored procedures (RPCs) and protected by Row-Level Security (RLS).
- **Sub-Second Real-Time Fan-Out**: Real-time state synchronizations are broadcast via Supabase Realtime (WebSockets) using PostgreSQL Change Data Capture (CDC), ephemeral broadcast channels, and presence heartbeats.
- **Authoritative Distributed Playback**: Audio playback on client devices is decoupled from media distribution. Clients execute local media renderers (YouTube IFrame API) configured to track an authoritative backend state machine.

```mermaid
graph TB
    subgraph ClientLayer["Frontend Application (Browser / React 18+ SPA)"]
        UI["UI Layer (shadcn/ui + Tailwind CSS)"]
        Stores["State Management (Zustand + TanStack Query)"]
        SyncEngine["Sync & Drift Engine"]
        YTPlayer["YouTube IFrame Player Wrapper"]
        RealtimeClient["Supabase Realtime Client"]
    end

    subgraph EdgeLayer["Edge & Proxy Layer"]
        VercelCDN["Global Edge CDN (Static Assets)"]
        SupabaseEdge["Supabase Edge Functions (Deno/TypeScript)"]
    end

    subgraph BackendLayer["Backend Services (Supabase & PostgreSQL)"]
        AnonAuth["Supabase Anonymous Auth"]
        RealtimeService["Supabase Realtime Engine (Elixir / WebSockets)"]
        PostgresCore[("PostgreSQL 15+ Core Engine")]
        RLSPolicies["Row-Level Security (RLS) Layer"]
        RPCFunctions["Transactional PL/pgSQL RPCs"]
        RoomSecrets[("room_secrets (Isolated Table)")]
    end

    subgraph ExternalServices["External Providers"]
        YouTubeData["YouTube Data API v3"]
    end

    UI --> Stores
    Stores --> SyncEngine
    SyncEngine --> YTPlayer
    Stores --> RealtimeClient

    RealtimeClient <-->|WebSockets (Presence / Broadcast / CDC)| RealtimeService
    Stores <-->|RESTful Data Access & RPC| PostgresCore

    SupabaseEdge -->|Cached Queries & Rate Limits| YouTubeData
    Stores -->|Search Queries| SupabaseEdge

    PostgresCore --- RLSPolicies
    PostgresCore --- RPCFunctions
    PostgresCore --- RoomSecrets
    PostgresCore -->|WAL CDC Events| RealtimeService
```

---

## 2. Technology Stack Selection & Justification

### 2.1 Frontend Framework & Core Libraries
| Technology | Version / Spec | Justification & Architectural Role |
| :--- | :--- | :--- |
| **React** | `^18.3` (or `19.x`) | Declarative, component-driven UI with robust concurrent rendering and ecosystem support. |
| **Vite** | `^5.x` / `^6.x` | Ultra-fast HMR, lean bundle production via Rollup, native ES module support. |
| **TypeScript** | `^5.x` | End-to-end type safety, strict compile checks, and unified database schema types generated from Supabase CLI. |
| **Tailwind CSS** | `^3.4` (or `4.x`) | Utility-first CSS framework enabling high-performance, dark-mode first design tokens. |
| **shadcn/ui** | Latest | Accessible, headless UI primitives built on Radix UI, fully customizable and unopinionated. |
| **Zustand** | `^4.5` / `^5.x` | Lightweight client state management. Handles ephemeral player state, local settings, and audio buffers without React re-render overhead. |
| **TanStack Query** | `^5.x` | Server-state caching, automatic cache invalidation, deduplication, and optimistic mutation handling. |
| **React Router** | `^6.x` / `^7.x` | Client-side declarative routing (`/`, `/rooms/:slugOrId`, `/explore`). |
| **Lucide React** | Latest | Consistent, lightweight SVG icon set. |

### 2.2 Backend & Data Layer
| Technology | Spec / Tooling | Justification & Architectural Role |
| :--- | :--- | :--- |
| **PostgreSQL** | `15+` (Supabase) | ACID-compliant relational storage, native JSONB support, row-level locking, and high-performance transactional execution. |
| **Supabase Anonymous Auth** | Built-in | Eliminates registration walls while establishing a cryptographically signed JWT with a persistent UUID for every guest. |
| **Supabase Realtime** | WebSockets Engine | Multi-channel communication supporting Presence (member rosters), Broadcast (low-latency controls), and Postgres Changes (CDC). |
| **Supabase RLS** | Declarative SQL | Enforces multi-tenant data isolation directly at the database engine level based on `auth.uid()`. |
| **PL/pgSQL RPCs** | Stored Procedures | Executes atomic operations (queue mutations, song transitions, voting thresholds) with row locking (`FOR UPDATE`). |
| **Supabase Edge Functions** | Deno runtime | Securely handles YouTube Data API key rotation, request caching, rate-limiting, and scheduled cleanup cron jobs. |

### 2.3 Audio & Video Integration
| Technology | Spec / API | Justification & Architectural Role |
| :--- | :--- | :--- |
| **YouTube Data API v3** | Google Cloud API | Powers song search, duration parsing, channel info, and high-res thumbnail extraction. |
| **YouTube IFrame Player API** | Official Embedded Player | Local media renderer that eliminates media re-encoding and legal streaming liabilities while giving programmatic control over playback, buffering, and seeking. Minimum 200x200px visible frame. |

---

## 3. Modular Codebase Architecture

```
src/
├── app/                      # Application entry, router, and provider tree
│   ├── App.tsx
│   ├── routes.tsx
│   └── providers.tsx
├── assets/                   # Static images, sounds, brand graphics
├── components/               # Presentation & reusable UI elements
│   ├── common/               # Generic widgets (Buttons, Inputs, Modals, Tooltips)
│   ├── layout/               # Navbars, Sidebars, Responsive Shells
│   ├── player/               # YouTube Player wrapper, controls, seek bar, audio banner
│   ├── queue/                # Queue list, queue item, drag handles, search modal
│   ├── chat/                 # Message stream, chat input, emoji reaction flyout
│   ├── room/                 # Room header, settings dialog, invite popover, member roster
│   └── ui/                   # Installed shadcn/ui components
├── features/                 # Vertical feature modules
│   ├── auth/                 # Guest initialization, onboarding modal, recovery
│   ├── room/                 # Room creation, joining, passcodes, permissions
│   ├── player/               # Drift detection, authoritative sync loop, autoplay unlock
│   ├── queue/                # Optimistic queue manipulations, skip voting
│   └── chat/                 # Realtime messages, moderation actions
├── hooks/                    # Reusable React hooks
│   ├── useAuth.ts            # Current guest session & profile
│   ├── usePlaybackSync.ts    # Central player synchronization hook
│   ├── useRoomRealtime.ts    # Supabase Realtime channel subscription manager
│   ├── useDriftCorrection.ts # Playback time diff & correction calculator
│   └── useDebounce.ts        # Input debouncing for search
├── repositories/             # Direct Supabase database client abstractions
│   ├── roomRepository.ts
│   ├── queueRepository.ts
│   ├── profileRepository.ts
│   └── chatRepository.ts
├── services/                 # External service integrations
│   ├── supabaseClient.ts     # Initialized Supabase client instance
│   ├── youtubeService.ts     # YouTube API search & metadata fetcher
│   └── syncEngine.ts         # Math models & timestamp reconciliation
├── stores/                   # Zustand state stores
│   ├── useAuthStore.ts       # Guest identity & active profile
│   ├── usePlayerStore.ts     # Ephemeral player state, local drift, audio-enabled flag
│   ├── useQueueStore.ts      # Client queue representation
│   ├── useRoomStore.ts       # Current room metadata, permissions, active settings
│   └── useUiStore.ts         # Mobile drawer states, active tabs, modal visibility
├── types/                    # TypeScript interfaces & database definitions
│   ├── database.types.ts     # Auto-generated Supabase schema types
│   ├── room.types.ts
│   ├── player.types.ts
│   └── queue.types.ts
└── utils/                    # Pure helper functions
    ├── timeFormatters.ts     # Seconds to mm:ss converter
    ├── driftMath.ts          # Drift delta & threshold calculations
    └── errorHandlers.ts      # Standardized UI error mappers
```

---

## 4. YouTube API Quota Management & Direct URL Optimization

The YouTube Data API v3 enforces a default daily quota of **10,000 units**.
- A `search.list` call costs **100 units** (100 un-cached searches/day limit).
- A `videos.list` (direct URL / ID lookup) costs only **1 unit**!

### Architectural Conservation Strategy:
1. **Canonical Query Caching**:
   - Client searches are sent to the Supabase Edge Function `/api/search-youtube`.
   - The query is canonicalized (`trim()`, `toLowerCase()`, punctuation stripping).
   - Results are cached in `public.youtube_search_cache` for **48 hours**.
   - Repeated searches for popular artists consume **0 API units**.
2. **Direct URL / Video ID Queuing**:
   - The UI permits users to paste a direct YouTube video URL (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`).
   - Direct URLs bypass `search.list` entirely, fetching metadata via `videos.list` (costing 1 unit) or via standard client-side oEmbed (costing 0 units).
3. **Quota Exceeded Fallback**:
   - If the daily 10,000 unit quota is exhausted (HTTP 429), the search modal gracefully informs the user: *"Search quota exceeded for today. You can still paste any direct YouTube link to queue music immediately!"*
