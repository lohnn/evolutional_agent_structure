#!/usr/bin/env python3
"""svcwatch — declarative process supervision for the dev container.

Stdlib-only. Spawned ONCE from /entrypoint.sh (PID 1 subtree — NEVER from an
agent shell: opencode sweeps its spawned-children tree on shutdown, SHADOW-024).
Adding a service = dropping one TOML file into the services dir. No shell
anywhere: every command is an argv array, exec'd via execvp.

Schema (per *.toml in --dir, one file per service):
    name = "matrix-relay"                # required, unique, [a-z0-9-]+
    command = ["node", "dist/relay.js"]  # required, argv array
    cwd = "/abs/path"                    # optional (default: /)
    env_file = "/path/to/.env"           # optional, PREFERRED for secrets
    env = { KEY = "val" }                # optional, merged over env_file
    restart = "always"                   # always | on-failure | never
    restart_delay_sec = 2                # initial backoff
    backoff_max_sec = 60                 # exponential cap
    start_grace_sec = 10                 # exit within grace => crash-loop
    # liveness_cmd = ["curl", "-sf", "http://127.0.0.1:PORT/health"]
    # liveness_interval_sec = 60
    # liveness_failures = 3

Crash detection is waitpid ONLY — never silence/inactivity-based (a healthy
process once stalled 7h49m; SHADOW-033). Liveness probes are opt-in, require a
POSITIVE failure signal (probe exit != 0), N consecutive failures, then ONE
restart + re-enter grace. No death-loops.
"""

import argparse
import fcntl
import json
import os
import re
import signal
import stat
import sys
import tempfile
import time
import tomllib

CONTROL_FIFO = "/run/svc/control.fifo"
CONTROL_LOCK = "/run/svc/control.lock"  # flock for single-watcher enforcement
STATUS_PATH = "/run/svc/status.json"
LOG_DIR = "/run/svc/logs"
STOP_GRACE_SEC = 5
SCAN_SEC = 2.0
LOG_MAX_BYTES = 1_048_576  # 1 MiB, size-based rotation to <name>.log.1

BASE_ENV = {
    "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "HOME": "/root",
    "LANG": "C.UTF-8",
    "TERM": "xterm-256color",
}


def log(msg):
    sys.stderr.write("[svcwatch] %s\n" % msg)
    sys.stderr.flush()


def rotate_if_big(path):
    """Keep exactly one generation (<path>.1). Runs once per scan per open log
    — the stat()s are cheap against a 2s loop that already stats every TOML."""
    try:
        if os.path.getsize(path) <= LOG_MAX_BYTES:
            return
        os.replace(path, path + ".1")
    except OSError:
        pass


def parse_env_file(path):
    """Minimal KEY=VALUE parser (no shell). Silently skips bad lines and a
    missing file — env_file is optional, its absence must not kill a service."""
    out = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k:
                    out[k] = v
    except OSError:
        pass
    return out


NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


class ConfigError(Exception):
    pass


class ServiceCfg:
    def __init__(self, path, data):
        def bad(msg):
            raise ConfigError("%s: %s" % (path, msg))

        name = data.get("name")
        if not isinstance(name, str) or not NAME_RE.match(name):
            bad("name missing or not [a-z0-9-]+")
        stem = os.path.splitext(os.path.basename(path))[0]
        if stem != name:
            bad("filename %r must equal name %r (one file per service)" % (stem, name))
        self.name = name

        cmd = data.get("command")
        if not isinstance(cmd, list) or not cmd or not all(isinstance(x, str) for x in cmd):
            bad("command must be a non-empty argv array (no shell)")
        self.command = cmd

        cwd = data.get("cwd")
        if cwd is not None and not isinstance(cwd, str):
            bad("cwd must be a string")
        self.cwd = cwd

        self.env_file = data.get("env_file")
        if self.env_file is not None and not isinstance(self.env_file, str):
            bad("env_file must be a string path")

        env = data.get("env") or {}
        if not isinstance(env, dict):
            bad("env must be a table")
        self.env = {str(k): str(v) for k, v in env.items()}

        self.restart = data.get("restart", "always")
        if self.restart not in ("always", "on-failure", "never"):
            bad("restart must be always | on-failure | never")

        def num(key, default, lo, hi):
            v = data.get(key, default)
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                bad("%s must be a number" % key)
            if not (lo <= v <= hi):
                bad("%s out of range [%s, %s]" % (key, lo, hi))
            return v

        self.restart_delay = num("restart_delay_sec", 2, 0.1, 3600)
        self.backoff_max = num("backoff_max_sec", 60, 0.1, 86400)
        self.start_grace = num("start_grace_sec", 10, 0, 3600)

        self.liveness_cmd = data.get("liveness_cmd")
        if self.liveness_cmd is not None:
            if not isinstance(self.liveness_cmd, list) or not self.liveness_cmd:
                bad("liveness_cmd must be a non-empty argv array")
            self.liveness_interval = num("liveness_interval_sec", 60, 1, 86400)
            self.liveness_failures = int(num("liveness_failures", 3, 1, 100))
        else:
            self.liveness_interval = self.liveness_failures = None


class Service:
    """Runtime state for one supervised service."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.pid = None
        self.started = 0.0
        self.state = "starting"  # starting | running | degraded | stopping | stopped | backoff
        self.next_start = 0.0    # backoff: earliest allowed (re)start
        self.backoff = cfg.restart_delay
        self.restarts = 0
        self.last_exit = None
        self.probe_failures = 0
        self.probe_restarted = False  # ONE liveness restart per healthy run
        self.next_probe = 0.0
        self.probe_pid = None         # in-flight liveness probe child
        self.pending_stop = None      # (deadline, sigkill_sent)
        self.deleted = False          # definition removed — stop, never restart
        self._log = None

    # ── process lifecycle ────────────────────────────────────────────────────

    def open_log(self):
        if self._log and not self._log.closed:
            return self._log
        path = os.path.join(LOG_DIR, self.cfg.name + ".log")
        self._log = open(path, "ab", buffering=0)
        return self._log

    def close_log(self):
        if self._log and not self._log.closed:
            try:
                self._log.close()
            except OSError:
                pass

    def build_env(self):
        env = dict(BASE_ENV)
        if self.cfg.env_file:
            env.update(parse_env_file(self.cfg.env_file))
        env.update(self.cfg.env)
        return env

    def start(self, now):
        if self.pid is not None:
            return
        try:
            pid = os.fork()
        except OSError as e:
            log("%s: fork failed: %s" % (self.cfg.name, e))
            self.next_start = now + self.backoff
            return
        if pid == 0:
            # ── child: own session (service's children die with it), exec ──
            try:
                os.setsid()
                logfd = self.open_log().fileno()
                os.dup2(logfd, 1)
                os.dup2(logfd, 2)
                devnull = os.open("/dev/null", os.O_RDONLY)
                os.dup2(devnull, 0)
                if self.cfg.cwd:
                    os.chdir(self.cfg.cwd)
                os.execvpe(self.cfg.command[0], self.cfg.command, self.build_env())
            except BaseException as e:
                try:
                    os.write(2, ("[svcwatch] exec failed: %s\n" % e).encode())
                except OSError:
                    pass
            os._exit(127)
        # ── parent ──
        self.pid = pid
        self.started = now
        self.state = "running"
        self.probe_failures = 0
        self.probe_restarted = False
        self.next_probe = now + self.cfg.start_grace + (
            self.cfg.liveness_interval or 0)
        log("%s: started pid %d" % (self.cfg.name, pid))

    def request_stop(self, sig=signal.SIGTERM):
        """Signal the process GROUP — the service's whole tree goes together."""
        if self.pid is None:
            return False
        if self.state != "stopping":
            self.state = "stopping"
            self.pending_stop = (time.monotonic() + STOP_GRACE_SEC, False)
        try:
            os.killpg(self.pid, sig)
            return True
        except ProcessLookupError:
            return True  # already gone; waitpid will collect it
        except OSError as e:
            log("%s: killpg failed: %s" % (self.cfg.name, e))
            return False

    def on_exit(self, status, now):
        code = os.waitstatus_to_exitcode(status)
        uptime = now - self.started
        self.last_exit = {"code": code, "at": time.time(), "uptime_sec": round(uptime, 1)}
        was_stopping = self.state == "stopping"
        self.pid = None
        self.pending_stop = None
        log("%s: exited code %s after %.1fs" % (self.cfg.name, code, uptime))
        if was_stopping:
            self.backoff = self.cfg.restart_delay
            # Three post-stop intents, in priority order:
            #   deleted           -> stay DOWN (definition is gone)
            #   next_start == 0.0 -> restart marker (changed def / ctl restart)
            #   otherwise         -> stay DOWN (ctl stop)
            if self.deleted:
                self.state = "stopped"
            elif self.next_start == 0.0:
                self.state = "backoff"
            else:
                self.state = "stopped"
            return
        # Policy: never restart if disabled or clean-exit-on-failure-only.
        if self.cfg.restart == "never" or (self.cfg.restart == "on-failure" and code == 0):
            self.state = "stopped"
            return
        if uptime < self.cfg.start_grace:
            # Crash-loop: died inside its grace window. Keep trying, louder.
            if self.state != "degraded":
                log("%s: DEGRADED (crash-loop: exit inside %ss grace)"
                    % (self.cfg.name, self.cfg.start_grace))
            self.state = "degraded"
        else:
            self.state = "backoff"  # healthy run, clean slate
            self.backoff = self.cfg.restart_delay
        self.restarts += 1
        self.next_start = now + self.backoff
        self.backoff = min(self.backoff * 2, self.cfg.backoff_max)

    # ── liveness (opt-in, positive-signal only) ──────────────────────────────

    def maybe_probe(self, now):
        c = self.cfg
        if not c.liveness_cmd or self.pid is None or self.state == "stopping":
            return
        if self.probe_pid is not None:  # one probe in flight at a time
            return
        if now < self.started + c.start_grace or now < self.next_probe:
            return
        self.next_probe = now + c.liveness_interval
        try:
            pid = os.fork()
        except OSError:
            return
        if pid == 0:
            try:
                os.setsid()
                devnull = os.open("/dev/null", os.O_RDWR)
                for fd in (0, 1, 2):
                    os.dup2(devnull, fd)
                os.execvpe(c.liveness_cmd[0], c.liveness_cmd, self.build_env())
            except BaseException:
                pass
            os._exit(127)
        self.probe_pid = pid  # reaped by the watcher's authoritative reap loop

    def on_probe_exit(self, status):
        self.probe_pid = None
        if os.waitstatus_to_exitcode(status) == 0:
            self.probe_failures = 0
            return
        self.probe_failures += 1
        log("%s: liveness probe FAILED (%d/%d)"
            % (self.cfg.name, self.probe_failures, self.cfg.liveness_failures))
        if self.probe_failures >= self.cfg.liveness_failures and not self.probe_restarted:
            self.probe_restarted = True  # ONE restart, then grace resets the flag
            log("%s: liveness threshold hit — restarting once" % self.cfg.name)
            self.request_stop()

    # ── status ───────────────────────────────────────────────────────────────

    def status(self, now):
        return {
            "name": self.cfg.name,
            "pid": self.pid,
            "state": self.state,
            "restarts": self.restarts,
            "last_exit": self.last_exit,
            "uptime_sec": round(now - self.started, 1) if self.pid else 0,
            "backoff_next_sec": (
                0.0 if self.next_start == 0.0
                else round(max(0.0, self.next_start - now), 1)
            ) if self.pid is None and self.state in ("backoff", "degraded") else None,
        }


class Watcher:
    def __init__(self, services_dir, watcher_log):
        self.dir = services_dir
        self.watcher_log = watcher_log
        self.services = {}            # name -> Service
        self.mtimes = {}              # name -> file mtime
        self.errors = {}              # name -> config error string
        # /run is tmpfs — wiped every boot — so the runtime dirs must exist
        # before the status tempfile below (and before the FIFO/lock in run()).
        for d in (os.path.dirname(STATUS_PATH), LOG_DIR, self.dir):
            os.makedirs(d, exist_ok=True)
        self._status_tmp = tempfile.NamedTemporaryFile(
            prefix="status.", dir=os.path.dirname(STATUS_PATH), delete=False).name

    # ── scan: TOML dir is the source of truth ────────────────────────────────

    def scan(self, now):
        seen = {}
        try:
            entries = list(os.scandir(self.dir))
        except OSError as e:
            log("scan: cannot read %s: %s" % (self.dir, e))
            return
        for ent in entries:
            if not ent.name.endswith(".toml"):
                continue
            name = ent.name[:-5]
            try:
                st = ent.stat()
            except OSError:
                continue
            seen[name] = st.st_mtime
        # deleted files → graceful stop (flag once; the service then stays down
        # and is pruned below once fully gone)
        for name in set(self.services) - set(seen):
            svc = self.services[name]
            if not svc.deleted:
                svc.deleted = True
                log("%s: definition removed — stopping" % name)
                svc.request_stop()
        # new / changed files
        for name, mtime in seen.items():
            if self.mtimes.get(name) == mtime:
                continue
            try:
                with open(os.path.join(self.dir, name + ".toml"), "rb") as f:
                    cfg = ServiceCfg(f.name, tomllib.load(f))
                self.errors.pop(name, None)
            except (ConfigError, tomllib.TOMLDecodeError, OSError) as e:
                self.errors[name] = str(e)
                log("%s: CONFIG ERROR: %s" % (name, e))
                self.mtimes[name] = mtime  # don't re-parse every scan
                continue
            self.mtimes[name] = mtime
            if name not in self.services:
                log("%s: new service" % name)
                self.services[name] = Service(cfg)
                self.services[name].start(now)
            else:
                svc = self.services[name]
                svc.deleted = False  # re-added
                svc.cfg = cfg
                log("%s: definition changed — restarting" % name)
                svc.next_start = 0.0  # marker: bring it back up after the stop
                if svc.pid is not None:
                    svc.request_stop()
                else:
                    svc.start(now)
        # prune forgotten names once fully gone
        for name in set(self.mtimes) - set(seen):
            svc = self.services.get(name)
            if svc is None or (svc.pid is None and name not in self.errors):
                self.services.pop(name, None)
                self.mtimes.pop(name, None)
                self.errors.pop(name, None)

    # ── reap & supervise ─────────────────────────────────────────────────────

    def reap(self, now):
        """The ONLY place children are reaped. Probes and services alike come
        through here so no exit status is ever lost to a stray wait()."""
        try:
            while True:
                pid, status, _ = os.wait4(-1, os.WNOHANG)
                if pid <= 0:
                    break
                for svc in self.services.values():
                    if svc.pid == pid:
                        svc.on_exit(status, now)
                        break
                    if svc.probe_pid == pid:
                        svc.on_probe_exit(status)
                        break
        except ChildProcessError:
            pass

    def tick(self, now):
        for svc in self.services.values():
            if svc.pid is not None:
                svc.maybe_probe(now)
                continue
            # Never restart a service that is mid-stop, fully stopped, or whose
            # definition was deleted. Only backoff/degraded (waiting to retry)
            # and the restart marker (next_start==0.0) are eligible.
            if svc.deleted or svc.state in ("stopping", "stopped"):
                continue
            if svc.cfg.restart != "never" and now >= svc.next_start:
                svc.start(now)
        # stop escalation: TERM → 5s → KILL
        for svc in self.services.values():
            if svc.state == "stopping" and svc.pending_stop:
                deadline, killed = svc.pending_stop
                if now >= deadline and not killed and svc.pid is not None:
                    log("%s: stop grace expired — SIGKILL" % svc.cfg.name)
                    svc.request_stop(signal.SIGKILL)
                    svc.pending_stop = (deadline, True)

    # ── control FIFO ─────────────────────────────────────────────────────────

    def handle_control(self, fifo_fd, now):
        try:
            line = os.read(fifo_fd, 4096).decode(errors="replace").strip()
        except OSError:
            return
        if not line:
            return
        parts = line.split(None, 1)
        cmd = parts[0]
        name = parts[1].strip() if len(parts) > 1 else ""
        svc = self.services.get(name)
        if cmd == "stop" and svc:
            svc.request_stop()
        elif cmd == "start" and svc:
            if svc.pid is None:
                svc.next_start = 0.0
                svc.start(now)
        elif cmd == "restart" and svc:
            svc.next_start = 0.0  # marker: bring it back up after the stop
            if svc.pid is not None:
                svc.request_stop()
            else:
                svc.start(now)
        elif cmd == "ping":
            pass
        else:
            log("control: unknown %r" % line)

    # ── status.json ──────────────────────────────────────────────────────────

    def write_status(self, now):
        payload = {
            "svcwatch": {"pid": os.getpid(), "dir": self.dir,
                         "up_since": self.up_since, "at": time.time()},
            "services": sorted(
                (s.status(now) for s in self.services.values()),
                key=lambda s: s["name"]),
            "config_errors": dict(sorted(self.errors.items())),
        }
        try:
            with open(self._status_tmp, "w") as f:
                json.dump(payload, f, indent=1)
            os.replace(self._status_tmp, STATUS_PATH)
        except OSError as e:
            log("status write failed: %s" % e)

    # ── main loop ────────────────────────────────────────────────────────────

    def run(self):
        self.up_since = time.time()
        os.makedirs(os.path.dirname(STATUS_PATH), exist_ok=True)
        os.makedirs(LOG_DIR, exist_ok=True)
        os.makedirs(self.dir, exist_ok=True)

        # single-watcher enforcement: a second watcher exits instead of
        # double-supervising the same TOMLs (two owners of one pid = chaos).
        lockfd = os.open(CONTROL_LOCK, os.O_CREAT | os.O_RDWR)
        try:
            fcntl.flock(lockfd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            log("another svcwatch holds %s — exiting" % CONTROL_LOCK)
            sys.exit(1)

        if not os.path.exists(CONTROL_FIFO):
            os.mkfifo(CONTROL_FIFO)
        # RDWR so the read end never sees EOF when a ctl writer disconnects.
        fifo_fd = os.open(CONTROL_FIFO, os.O_RDWR | os.O_NONBLOCK)

        # SIGCHLD sets a flag (handlers must be minimal); the loop polls it and
        # short-circuits its sleep so a dead child is reaped promptly, not on
        # the next 2s scan boundary.
        self._child_event = False
        def _on_chld(*_):
            self._child_event = True
        signal.signal(signal.SIGCHLD, _on_chld)
        signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

        log("watching %s (pid %d)" % (self.dir, os.getpid()))
        next_scan = 0.0
        next_status = 0.0
        while True:
            # A fault in any single pass must NEVER kill the watcher (it is the
            # only thing keeping every service alive). Log and keep going.
            try:
                now = time.monotonic()
                if now >= next_scan:
                    self.scan(now)
                    rotate_if_big(self.watcher_log)
                    for name in list(self.services):
                        rotate_if_big(os.path.join(LOG_DIR, name + ".log"))
                    next_scan = now + SCAN_SEC
                self.reap(now)
                self.tick(now)
                if now >= next_status:
                    self.write_status(now)
                    next_status = now + SCAN_SEC
            except Exception:
                import traceback
                log("WATCHER FAULT (isolated, continuing):\n" + traceback.format_exc())
            # Sleep until the next scan/status tick, but wake early on a child
            # event (SIGCHLD) or a control-FIFO write. Poll in short slices so
            # a flag set just after select() starts is still caught quickly.
            import select
            deadline = time.monotonic() + max(
                0.05, min(next_scan, next_status) - time.monotonic())
            while time.monotonic() < deadline:
                if self._child_event:
                    self._child_event = False
                    break
                try:
                    r, _, _ = select.select([fifo_fd], [], [], 0.1)
                except OSError:
                    break
                if r:
                    self.handle_control(fifo_fd, time.monotonic())


def main():
    ap = argparse.ArgumentParser(description="declarative process supervisor")
    ap.add_argument("--dir", required=True, help="services TOML directory")
    ap.add_argument("--log", default="/var/log/svcwatch.log",
                    help="watcher's own log (for size rotation bookkeeping)")
    args = ap.parse_args()
    Watcher(args.dir, args.log).run()


if __name__ == "__main__":
    main()
