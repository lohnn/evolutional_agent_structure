# Local Ports — registry and serving conventions

Read on demand. The trigger rule (bind `0.0.0.0`, serve from `/tmp/opencode/proto/<slug>/`,
prototypes live on `4500`–`4504`) is in the root `AGENTS.md`; everything below is the detail
behind it.

This container is a Docker environment. A port is only reachable from the user's other
devices (phone, laptop) if **both** are true:

1. Something inside the container is listening on **`0.0.0.0`** — not `127.0.0.1`.
2. The **host** publishes that container port.

Getting (1) wrong is the common failure and it is silent: `curl` from inside the container
returns `200`, and the user still sees nothing. Always verify the bind address, not just
that the server responds.

## Registry

| Port | Bind | Owner | Notes |
|---|---|---|---|
| `3000` | `0.0.0.0` | OpenChamber | published |
| `4096` | `127.0.0.1` | opencode itself | internal — do not expose |
| `4400` | `0.0.0.0` | hive-board | published; see `projects/hive-board/deploy/` |
| `4500`–`4504` | `0.0.0.0` | **reserved — throwaway prototypes** | see below |
| `8096` | `0.0.0.0` | Jellyfin | published; JellyFetch plugin work |
| *(ephemeral)* | `127.0.0.11` | Docker's embedded DNS | not ours; the port number changes per container start |

Before claiming any new port, list what is actually listening (see *Inspecting* below) and
add a row here. Ports outside this table are unclaimed but unpublished — usable for
container-internal work only.

## The prototype range: `4500`–`4504`

Reserved for disposable, user-facing demos: visual references, icon/state ladders, layout
comparisons, anything the user may want to open on a phone.

A **range** rather than a single port, because the point of these is comparison — two
prototypes side by side, or an A/B of the same page, without tearing one down to see the
other. Five slots is arbitrary but cheap.

**Conventions:**

- One directory per prototype: `/tmp/opencode/proto/<slug>/`. Default to `4500` and climb
  only when it is occupied.
- Keep the **source** in `/workspace/scratch/<slug>/` and serve a **copy** from `/tmp`.
  See *Lifetime* below — this is what makes a killed server cheap to recover.
- **Never serve from `/workspace` or from `/tmp/opencode` directly.** `python3 -m http.server`
  publishes its entire working directory with no authentication. Rooted at the workspace that
  exposes `.opencode/` — credentials, session state, the lot — to anything on the LAN.
- Bind `0.0.0.0`.
- Prefer self-contained single-file HTML (inline CSS/JS, no external assets). It survives
  being copied to a device and opened as a `file://` URL, which sidesteps ports entirely for
  one-offs.

**Launching** (same detachment rules as the Flutter recipe in the root `AGENTS.md` — both
streams redirected on the *outer* command, outside the `-c` string):

```
setsid --fork bash -c 'cd /tmp/opencode/proto/<slug> && python3 -m http.server 4500 --bind 0.0.0.0' \
  > /tmp/opencode/proto/serve-4500.log 2>&1 </dev/null
```

Launch in one tool call, verify in the next — never both in one.

## Lifetime — what kills a prototype server

These servers are more fragile than "it dies when the container restarts" suggests. Two
*independent* kill mechanisms, both observed on 2026-07-28:

- **An opencode restart kills the server even though `/tmp` is untouched.** A
  `setsid --fork` server on `4500` died this way twice in one session, while its
  directory, its files and its own log all survived intact. `setsid` detaches the
  process from the *shell* — which is what stops the Bash tool from tree-killing it —
  but that is not the same as surviving opencode itself going away. The mechanism is
  unconfirmed (process reaping, a shared cgroup, something else); the observation is
  not. **Never assume a server launched in an earlier session is still up.** Re-verify
  with `curl` before handing the user a URL.
- **A container restart may or may not wipe `/tmp`.** In the same session, one restart
  cleared `/tmp` entirely and a later one left it fully populated and only killed the
  process. So `/tmp` is **ephemeral and unreliable in both directions**: do not count on
  it persisting (the artifact can vanish), and do not count on it being wiped (it is not
  a cleanup mechanism and not a security boundary). No firmer rule than "unreliable" has
  been established — do not write one into this file without evidence.

Either way the conclusion is the same: nothing that took effort to produce should exist
*only* under `/tmp`.

### Recovery pattern: source in `scratch/`, serve a copy from `/tmp`

Keep the prototype's **source** in `/workspace/scratch/<slug>/`, and serve a **copy** of
it from `/tmp/opencode/proto/<slug>/`.

`/workspace/scratch/` is gitignored (`.gitignore:21`, the `/scratch/` rule), so it never
pollutes a commit, and it sits on the workspace volume, so it survives both kill
mechanisms above. Serving the copy rather than the original keeps the "never serve from
`/workspace`" rule intact — the HTTP server still only ever roots at a throwaway
directory.

```
mkdir -p /tmp/opencode/proto/<slug>
cp -r /workspace/scratch/<slug>/. /tmp/opencode/proto/<slug>/
```

The payoff is the whole point: after a restart, recovery is one copy plus one relaunch
instead of regenerating the artifact. Iterate by editing in `scratch/`, re-copying, and
relaunching.

## Security posture

These servers have **no authentication and never will**. Publish the prototype range to the
LAN only — never to the public internet, and never through a tunnel that terminates outside
the local network. Treat anything served on `4500`–`4504` as world-readable by everything on
the same network.

## Adding a published port

The host-side port mapping lives **outside** `/workspace` — there is no compose or
devcontainer file in the workspace describing this container. The agent cannot change it;
the user must add the mapping on the host (e.g. `-p 4500-4504:4500-4504`, or the compose
equivalent) and restart the container. Then the URL from another device is
`http://<docker-host-LAN-IP>:<port>/`.

## Inspecting what is listening

`ss`, `netstat`, and `ip` are **not installed** in this container. Read `/proc/net/tcp`
directly:

```
python3 -c "
d=open('/proc/net/tcp').read().splitlines()[1:]
for l in d:
    f=l.split()
    if f[3]!='0A': continue            # 0A = LISTEN
    a,p=f[1].rsplit(':',1)
    ip='.'.join(str(int(a[i:i+2],16)) for i in (6,4,2,0))
    print(int(p,16), ip)"
```

Check `/proc/net/tcp6` the same way for IPv6 listeners.

## Teardown

Leftover prototype servers accumulate — within a session they outlive the conversation that
started them, and nothing reaps them. Check the range before assuming a port is free. (This
does not contradict *Lifetime* above: they survive fine until opencode or the container
restarts, at which point they all vanish at once. Both "still running, forgotten" and "gone
without notice" are normal — which is why you always check rather than assume either.)

**Hazard:** `pkill -f "<pattern>"` matches against full command lines, including *the command
line of the shell running the pkill*. If the pattern appears in the same Bash call (for
example `pkill -f "http.server 4500"`), pkill kills its own parent shell; the remaining
commands in that call never run and the tool call hangs until its timeout rather than
failing. Match on something that cannot appear in the killing command — e.g. bracket a
character, `pkill -f "http[.]server 4500"` — or kill by PID.
