import type { WriteStream } from 'node:tty';

// Alternate-screen-buffer management. ABSOLUTE renders into the terminal's
// alternate screen (\x1b[?1049h) so the shell scrollback is never polluted and
// mouse/resize traces cannot linger after exit. Global one-time handlers
// guarantee we always leave (\x1b[?1049l) and reshow the cursor even on hard
// exits (SIGINT/SIGTERM) or crashes — this is the fix for the "mouse leaves
// traces, feels unstable" behavior seen when rendering inline.

const ENTER = '\x1b[?1049h';
const LEAVE = '\x1b[?1049l\x1b[?25h';

let stream: WriteStream | null = null;
let entered = false;
let left = false;
let wired = false;

function leaveNow(): void {
  if (left) return;
  left = true;
  if (entered && stream) {
    try {
      stream.write(LEAVE);
    } catch {
      // stdout may already be unwritable during teardown; best-effort.
    }
  }
  entered = false;
}

// Best-effort restore of line discipline for hard-exit paths. Ink owns raw
// mode for its own controlled exits; this only covers external kill signals
// where ink's cleanup may not run.
function restoreStdinRaw(): void {
  try {
    const s = process.stdin as { setRawMode?: (active: boolean) => void; isRaw?: boolean };
    if (s.isRaw && typeof s.setRawMode === 'function') {
      s.setRawMode(false);
    }
  } catch {
    // not a TTY or already restored
  }
}

function wireGlobals(): void {
  if (wired) return;
  wired = true;

  // Normal / useApp().exit() teardown: the process 'exit' event fires on every
  // path, so leaving here catches them all idempotently.
  process.once('exit', leaveNow);

  const onSignal = (sig: 'SIGINT' | 'SIGTERM'): void => {
    leaveNow();
    restoreStdinRaw();
    process.exit(sig === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  // Crash path: leave the alt screen, then rethrow on a fresh tick so the
  // (already consumed) handler is not re-triggered and the default
  // print-stack-and-exit behavior takes over with the full error.
  process.once('uncaughtException', (err) => {
    leaveNow();
    restoreStdinRaw();
    setImmediate(() => {
      throw err;
    });
  });
}

export function enterAltScreen(stdout: WriteStream): void {
  stream = stdout;
  if (!entered) {
    stdout.write(ENTER);
    entered = true;
  }
  wireGlobals();
}

export function leaveAltScreen(): void {
  leaveNow();
}