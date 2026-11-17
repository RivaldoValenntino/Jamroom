# JAMROOM — UI/UX Design System & Experience Guidelines (Audited & Hardened)

## 1. Visual Identity & Design System

JAMROOM is engineered around an immersive, **dark-mode first, neon-accented aesthetic** that evokes the energy of late-night DJ sessions, high-fidelity sound lounges, and contemporary music communities.

### 1.1 Color Palette & Theme Tokens
Built on Tailwind CSS and shadcn/ui CSS custom properties:

```css
:root {
  /* Core Backgrounds */
  --background: 240 10% 4%;       /* Deepest Charcoal (#0a0a0c) */
  --surface: 240 8% 8%;          /* Elevated Container (#141418) */
  --surface-hover: 240 8% 12%;    /* Interactive Hover (#1f1f24) */
  
  /* Text & Contrast */
  --foreground: 0 0% 98%;         /* Crisp White (#fbfbfb) */
  --muted-foreground: 240 5% 65%; /* Soft Silver (#9e9ea7) */
  
  /* Accents & Brand Vibrancy */
  --primary: 262 83% 58%;         /* Electric Purple (#7c3aed) */
  --primary-foreground: 0 0% 100%;
  --secondary: 187 92% 55%;       /* Neon Cyan (#22d3ee) */
  --accent: 330 81% 60%;          /* Vivid Magenta (#f43f5e) */
  
  /* Status Indicators */
  --success: 142 71% 45%;         /* Emerald Green (Connected) */
  --warning: 38 92% 50%;          /* Amber (Reconnecting / Buffering) */
  --destructive: 0 84% 60%;       /* Crimson (Errors / Kicked) */
}
```

### 1.2 Typography & Iconography
- **Headings**: Modern geometric sans-serif (`Inter`, `Plus Jakarta Sans`, or `Geist`).
- **Body & Metadata**: Clean legibility with tabular figures (`font-variant-numeric: tabular-nums`) for timestamps (`03:45 / 04:12`) and queue position counters.
- **Icons**: Lucide React (`Play`, `Pause`, `SkipForward`, `Volume2`, `Music`, `Users`, `MessageSquare`, `Share2`, `Settings`).

---

## 2. Responsive Screen Layouts & YouTube Policy Compliance

### 2.1 YouTube Player Sizing & Visibility Rule
To comply with YouTube API Developer Policies:
- The YouTube player must maintain minimum dimensions of **200px by 200px** (JAMROOM enforces 16:9 responsive frame, min 320x180px on mobile).
- The player must **never** be hidden (`display: none`, `visibility: hidden`, or opacity 0).
- On mobile devices, when switching between "Queue" and "Chat" tabs, the video player remains docked as a persistent 16:9 top viewport so playback and YouTube branding remain visible.

### 2.2 Desktop Experience (3-Column / Pro Studio View)
Designed for screens $\ge 1024\text{px}$:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🎵 JAMROOM   [Search Music...]    [Lobby]   [Room Settings]   [DJ Alex (You)]│
├───────────────────────┬─────────────────────────────┬───────────────────────┤
│ COLLABORATIVE QUEUE   │ NOW PLAYING (STAGE)         │ SOCIAL & CHAT         │
│                       │                             │                       │
│ ┌───────────────────┐ │ ┌─────────────────────────┐ │ 👥 Online (14)        │
│ │ Search & Add [+]  │ │ │                         │ │ • DJ Alex (Owner)     │
│ └───────────────────┘ │ │   YouTube IFrame Player │ │ • Sarah (Mod)         │
│                       │ │   (16:9 Aspect Ratio)   │ │ • Guest_9821          │
│ 1. Daft Punk - One... │ │   (Min 320x180px)       │ │                       │
│    Queued by Alex     │ └─────────────────────────┘ │ ───────────────────── │
│ 2. The Weeknd - Star. │ Daft Punk - One More Time   │ 💬 Live Room Chat     │
│    Queued by Sam      │ 01:24 ━━━●──────── 05:20    │ [Sam]: Best drop ever!│
│ 3. Dua Lipa - Levit.  │ [◀◀]  [ ▶ / ⏸ ]  [▶▶ Skip]  │ [Sarah]: Turn it up 🔥│
│    Queued by Jordan   │ 🗳️ Vote Skip (3/7)  🔊 85%  │                       │
│                       │                             │ [Type message...] [🚀]│
└───────────────────────┴─────────────────────────────┴───────────────────────┘
```

### 2.3 Mobile Responsive Experience ($\le 768\text{px}$)
- **Persistent Top Dock**: The 16:9 YouTube video player is docked to the top, remaining continuously visible during tab navigation.
- **Bottom Tab Navigation**: Four primary tabs allow instant single-thumb navigation:
  - 🎵 **Now Playing**: Track details, lyrics snippet, skip voting bar, volume.
  - 📋 **Queue (4)**: Draggable queue list with floating search button (`+`).
  - 💬 **Chat (12)**: Full-height chat stream with sticky keyboard-safe input.
  - 👥 **People (8)**: Member list, roles, and room info.

---

## 3. Critical User Experience Workflows

### 3.1 Zero-Friction Guest Onboarding
```
[User arrives at jamroom.live]
       │
       ▼ (Background: Supabase signInAnonymously)
[Display Name Modal appears]
 ┌──────────────────────────────────────────────────┐
 │ Welcome to JAMROOM! 🎧                           │
 │ Choose how you want to appear in rooms:          │
 │                                                  │
 │ [ DJ Groovy Beats             ] [ 🎲 Surprise Me]│
 │                                                  │
 │ Select Avatar:                                   │
 │ ( 🤖 )  ( 🦊 )  ( 🎧 )  ( ⚡ )  ( 🚀 )           │
 │                                                  │
 │ [ Start Listening Now ➔ ]                        │
 └──────────────────────────────────────────────────┘
```

### 3.2 The "Enable Audio / Join Listening" Experience
To comply with browser unmuted autoplay policies without breaking synchronized room immersion:
1. When a user navigates to an ongoing session, video loads cued at the exact second.
2. A stylish, non-blocking glassmorphism banner floats over the lower third:
   ```
   ┌────────────────────────────────────────────────────────┐
   │ 🔊 Music is playing in this room!                      │
   │ Synchronized with 12 other listeners.                  │
   │                               [ Join Listening (🔊) ] │
   └────────────────────────────────────────────────────────┘
   ```
3. Clicking **Join Listening** immediately activates audio on the client's local YouTube player, dismisses the banner, and marks `is_audio_enabled: true` in the room Presence state.

### 3.3 Collaborative Search & Direct URL Queuing
1. Clicking **Add Song** opens a modal overlay with dual input modes:
   - **Search Input**: Instant debounced search querying the cached YouTube proxy endpoint.
   - **Direct URL / Video ID**: Direct paste input (e.g. `https://youtube.com/watch?v=...`) that bypasses search quota.
2. Each result item displays high-def thumbnail, exact duration, channel title, and one-click **[+ Add to Queue]** action.

### 3.4 Democratic Skip Voting Experience
- When an active listener clicks **Vote to Skip**:
  - The button turns purple and reads: `Voted (3/5 required)`.
  - A subtle progress bar fills under the track title.
  - A friendly system message posts in chat: *"Sam voted to skip (3/5)"*.
  - When the final vote is cast, a brief transition animation plays: *"Vote threshold reached! Skipping to next track..."*.

---

## 4. Accessibility (WCAG 2.1 AA Compliance)

- **Color Contrast**: All text elements maintain a minimum contrast ratio of 4.5:1 against their backgrounds.
- **Keyboard Shortcuts**:
  - `Space`: Toggle Play/Pause (when authorized).
  - `M`: Toggle local client mute.
  - `L`: Vote to skip current track.
  - `/`: Focus search input.
  - `Esc`: Close modals and sidebars.
- **Screen Reader Support**: All icons have descriptive `aria-label` attributes (`aria-label="Skip to next song"`, `aria-label="3 of 5 votes to skip"`).
- **Reduced Motion**: Respects `prefers-reduced-motion: reduce` by disabling floating reaction animations and heavy transitions.
