# Security notes

Findings from an OWASP-oriented review of the whole application, and what was done
about each one. Categories refer to the OWASP Top 10 (2021).

## Fixed

### A01 Broken access control

| Issue | Where | Fix |
| --- | --- | --- |
| Any logged-in user could move any unit in any game. The guard was `if(!socketOwnerCanAct(...) && player && player.team != unit.team)`, which is false whenever `player` is undefined, i.e. for a caller who is not in the game at all. | `executePath.js` | All three conditions must now hold: the caller is a player in the game, it is their turn, and the unit is theirs. |
| Any room member could start someone else's game, repeatedly. `launch room` had no owner check, and `delete room` deleted a local variable instead of the entry in `rooms`, so a room survived its launch and could be launched again (a fresh game and units each time). | `lobby.js` | Owner-only, once-only (`room.launching`), and the room is really removed. |
| Path traversal: the map name from `create room` was concatenated straight into `static/data/maps/<name>`, so `../../../etc/passwd` was read and parsed, and stored on the game to be re-read every turn. | `loadUtils.js`, `lobby.js` | File names are validated (no separators, no `..`, no NUL, no leading dot), the resolved path is checked to stay inside `static/data`, and the requested map must be one that actually exists. |
| `kick`, `set faction` and `set alliance` indexed `room.players` with an unvalidated `slot`, so `"constructor"` or `"length"` reached `Array.prototype` members instead of a player. | `lobby.js` | Slots must be integers inside the room's player array. |
| Every connected socket received every `moved` event, in every game, including the allied (hidden-unit) payload's siblings. | `executePath.js` | Emits are filtered by game id. |
| Anonymous-seat tokens (bearer credentials for a player seat) were broadcast in room data to everyone in the room, and shipped to the game list template. | `lobby.js`, `gameList.js` | Room and game-list payloads are projected down to what the client needs. Only the team-1 player still receives them, from `alldata`, which is how local seats are meant to work. |
| No CSRF protection on `/login`, `/signup` or `/changeusername`. | `security.js`, `auth.js`, views | Per-session synchronizer token, compared in constant time, plus `SameSite=Lax` on the session cookie. |
| Cross-site WebSocket hijacking: WebSocket upgrades are not covered by CORS, and socket.io accepted any origin. | `server.js` | `allowRequest` requires a same-origin (or configured-origin) handshake. |
| `passport.socketio` accepts a session id from the handshake query string, bypassing the signed session cookie. | `server.js` | Handshakes carrying `session_id` are refused. |

### A02 Cryptographic failures

- Passwords were stored as single-round salted SHA1 HMAC (`password-hash`). New
  hashes use scrypt at the OWASP Password Storage settings (N=2^16, r=8, p=2);
  existing sha1 hashes still verify and are re-hashed on the next successful
  login. See `password.js`.
- Anonymous-seat tokens came from `Math.random()`. They now come from
  `crypto.randomBytes` and are compared in constant time.
- A production process refuses to start with a missing, placeholder or short
  `SESSION_SECRET` (`config.js`).
- The session cookie is `HttpOnly`, `SameSite=Lax`, `Secure` when `ORIGIN` is
  https, has a 7-day lifetime, and is no longer named `connect.sid`.

### A03 Injection

- Form bodies are parsed with `extended: false` and a 16 kB limit, so
  `username[$ne]=x` can no longer arrive as a Mongo query operator.
- Every value that reaches a Mongo query or a map lookup is validated first:
  game ids (24-hex), coordinates, paths, slots, alliances, factions, chat text,
  usernames, passwords. See the validators in `security.js`.
- The password hash is projected out of `deserializeUser`, so it never rides
  along on `req.user` or `socket.request.user`.

### A04 Insecure design

- Client-driven socket events are rate limited per socket (game actions, lobby
  chatter, room creation, anon-auth attempts).
- Bounded state: rooms, room-name and chat length, path length, games per
  socket, and the rate-limiter key table itself.
- `join lobby` no longer appends a duplicate name on every call, and `join game`
  no longer appends a duplicate subscription; disconnect removes all of a
  socket's subscriptions rather than just the first.

### A05 Security misconfiguration

- Security headers on every response: CSP (no inline or eval for scripts),
  `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, COOP/CORP,
  `Permissions-Policy`, and HSTS when the origin is https. `x-powered-by` is off.
- A malformed socket payload can no longer take the process down: every listener
  is wrapped, and errors (including rejected promises) are logged instead of
  becoming uncaught exceptions. Handlers that used to dereference
  `socket.request.user` or an off-map tile now check first.
- Express error handler returns a plain 500 instead of a stack trace.
- The container runs as `node`, not root, and installs with `--ignore-scripts`.
- MongoDB is published on `127.0.0.1` only.

### A07 Authentication failures

- `docker-compose` seeded two accounts (`hello`, `goodbye`) whose password was
  `world`, on every fresh deployment. `init.mongo.js` now only creates indexes.
- Rate limits: 10 logins per 15 minutes, 5 signups and 10 renames per hour, per IP.
- Session id is regenerated on login and on signup (session fixation), and the
  session is destroyed on logout.
- Password policy: 12-200 characters. Username policy: 3-24 characters from a
  restricted set, and names starting with `anon`, `facebook-`, `twitter-` or
  `google-` are reserved so a local account cannot impersonate an OAuth user or
  an anonymous seat.
- A unique index on `users.username` closes the signup/rename race that the
  application-level check alone loses.
- Missing accounts spend comparable time to real ones during login, and both
  failure modes give the same message.
- OAuth flows pass `state` where the strategy supports it.

### A06 Vulnerable components

`passport-twitter@1.0.4` depends on `xtraverse` -> `xmldom`, which has unfixed
advisories including a critical one. There is no non-breaking upgrade. The
strategy is now required lazily, so a deployment with `TWITTER_ENABLED=false`
(the default) never loads that XML parser, and enabling it logs a warning.
**Recommendation: drop the twitter provider and the dependency.** That is a
feature removal, so it was left as a decision rather than done here.

## Accepted / not changed

- **Signup and rename report "username taken".** This is user enumeration, but
  the alternative makes the feature unusable. Login itself does not enumerate.
- **`GET /logout` is not CSRF-protected.** The logout links live in static pages
  that cannot carry a server-rendered token. `SameSite=Lax` stops subresource
  requests from carrying the session cookie, so only a deliberate top-level
  navigation can log a user out; the impact is a logout.
- **A logged-in user can read the board of a game they are not in** via
  `alldata` (hidden units are still filtered out). Spectating looks intentional;
  locking it to participants would break observers.
- **MongoDB itself runs without authentication** in the compose setup. It is no
  longer reachable off-host; enabling auth means credentials in `MONGO_STRING`
  and is documented in `.env.example`.
- **Breached-password checks** (ASVS 2.1.7) are not implemented.

## Verification

The changes were exercised against a live server and MongoDB:

- HTTP: header presence, CSRF rejection, cookie flags, password and username
  policy, session rotation on login/signup, NoSQL-injection attempt on login,
  login throttling, legacy-hash login and upgrade, rename authorization.
- Sockets: cross-origin and `session_id` handshake rejection, map path traversal,
  malformed lobby payloads (`constructor`/`__proto__`/operator objects), non-owner
  launch attempt, an outsider trying to move another player's unit, a player
  trying to move an opponent's unit, a legitimate move, ~20 malformed game
  payloads, join-game spam, and an oversized message.
- Browser: a full game loads and renders with no CSP violations; the lobby
  connects, lists maps and creates rooms.
