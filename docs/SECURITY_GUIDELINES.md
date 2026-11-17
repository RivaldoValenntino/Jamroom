# JAMROOM — Security & Threat Modeling Guidelines (Audited & Hardened)

## 1. Zero-Trust Security Philosophy

JAMROOM operates in a zero-trust browser environment. Because the platform utilizes **Guest-Only Anonymous Authentication**, any visitor can execute API requests with a valid signed JWT. Therefore, the system enforces:
1. **Server-Side Authority**: No client-reported role or privilege is ever trusted.
2. **Credential Quarantine**: Passwords and recovery keys are isolated in `room_secrets` with `RLS: false`, inaccessible by client SQL queries.
3. **Cryptographic Protection of Passcodes & Keys**: Room passwords and recovery tokens are hashed using bcrypt (`pgcrypto`).
4. **Secret Isolation**: YouTube Data API keys and Supabase Service Role keys are quarantined in Edge Functions and server environments, never bundled into frontend assets.

---

## 2. Threat Modeling & Mitigation Matrix

| Threat | Attack Vector | Technical Mitigation |
| :--- | :--- | :--- |
| **Unauthorized Playback Takeover** | Malicious user sends spoofed WebSocket/RPC events to seek, pause, or mute a host's room. | `rpc_set_playback_state` strictly asserts caller's role in `room_members` (`owner`/`moderator`) or checks `settings.shared_speakers == true`. RLS completely blocks direct `UPDATE` on `playback_states`. |
| **Room Password & Recovery Leakage** | Attacker executes `SELECT * FROM rooms` to scrape password hashes for offline cracking. | `password_hash` and `recovery_hash` are moved into the quarantined `public.room_secrets` table with `RLS FOR ALL USING (false)`. Direct SELECT returns zero rows. |
| **Room Recovery Brute-Force** | Script repeatedly calls `rpc_claim_room_ownership` with random recovery strings. | Server tracks `failed_recovery_attempts`. After 5 failed attempts, the room recovery is locked for 1 hour (`recovery_locked_until`). Token is rotated upon recovery. |
| **Skip Vote Manipulation** | Attacker calls `vote_to_skip` passing a fake `active_listeners = 1` count to force instant skips. | Client count parameter is eliminated. The server calculates active members directly from `room_members.last_active_at > NOW() - INTERVAL '45s'`. |
| **Queue Flooding & Denial of Service** | Script spams thousands of song additions to exhaust memory or corrupt the playlist. | 1. Rate limiting on `rpc_add_queue_item`.<br/>2. Database enforces `settings.max_queue_items_per_user` per guest.<br/>3. Cap maximum active queue items per room (e.g., 200). |
| **Chat XSS & Script Injection** | Attacker posts malicious `<script>` or markdown payloads in room chat. | 1. Text is sanitized on client using React's safe DOM escaping.<br/>2. PostgreSQL enforces `char_length(content) <= 1000`.<br/>3. Content-Security-Policy (CSP) headers block inline scripts. |
| **YouTube API Quota Depletion** | Scraping the search endpoint to burn through daily Google Cloud quota units. | 1. Client never accesses YouTube API directly.<br/>2. Supabase Edge Function proxies searches behind client IP / user rate limiting.<br/>3. 48-hour persistent cache in `youtube_search_cache`. Direct YouTube URL queuing fallback. |
| **Forged Guest Identity** | Attacker tampers with user ID in HTTP headers to impersonate the room owner. | Identity is derived solely from the cryptographically verified JWT (`auth.uid()`). Any client-supplied user ID is ignored. |

---

## 3. Secret Isolation & Environment Configuration

### 3.1 Client-Safe Environment Variables (`.env.production`)
Only non-sensitive public configuration keys may be prefixed with `VITE_`:
```env
VITE_SUPABASE_URL=https://xyzcompany.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi... (Public Anon Key with RLS restriction)
VITE_APP_URL=https://jamroom.live
```

### 3.2 Quarantine: Secrets Forbidden on the Frontend
The following secrets **MUST NEVER** appear in frontend code, git commits, or `VITE_` variables:
- `SUPABASE_SERVICE_ROLE_KEY`: Bypasses all RLS policies; restricted to Edge Functions and migration scripts.
- `YOUTUBE_API_KEY`: Stored exclusively in Supabase Vault / Edge Function secrets.

---

## 4. Rate Limiting Specifications

| Endpoint / Operation | Rate Limit Window | Threshold | Action on Exceed |
| :--- | :--- | :--- | :--- |
| **YouTube Search Proxy** | 1 Minute | 15 searches / user | HTTP 429 Too Many Requests |
| **Add Song to Queue** | 10 Seconds | 3 additions / user | Database exception thrown |
| **Send Chat Message** | 5 Seconds | 5 messages / user | UI throttle + DB rejection |
| **Vote to Skip** | 10 Seconds | 1 vote / song / user | Idempotent ignore (ON CONFLICT DO NOTHING) |
| **Room Password / Recovery** | 5 Minutes | 5 attempts / IP or Room | 1-hour account / room lockout |

---

## 5. Content Security Policy (CSP)

JAMROOM deploys strict HTTP response headers:
```http
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' https://www.youtube.com https://s.ytimg.com;
  frame-src https://www.youtube.com https://www.youtube-nocookie.com;
  img-src 'self' https://i.ytimg.com https://img.youtube.com https://api.dicebear.com data:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  style-src 'self' 'unsafe-inline';
```
