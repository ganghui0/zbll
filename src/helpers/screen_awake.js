// Keeps the screen on while the page is in use in a way that the computer does not notice, like turning a
// bluetooth cube: with no key pressed and the mouse left alone, the screen saver would come up.

// idleMs: how long the screen is kept on after the latest use. After that the computer is free to dim the
// screen and to sleep again.
// Returns {used(): the page was used just now, release(): it is not in use any more}
// Does nothing in a browser without the Screen Wake Lock API.
export const createScreenKeeper = idleMs => {
  const wakeLock = typeof navigator !== "undefined" ? navigator.wakeLock : undefined
  let lock = null // the WakeLockSentinel that we hold
  let asking = false
  let idleTimer = 0 // runs for as long as the screen is to be kept on

  const release = () => {
    clearTimeout(idleTimer)
    idleTimer = 0
    lock?.release().catch(() => {})
    lock = null
  }

  const ask = async () => {
    if (!wakeLock || idleTimer === 0 || lock !== null || asking || document.visibilityState !== "visible") {
      return
    }
    asking = true
    try {
      const granted = await wakeLock.request("screen")
      granted.addEventListener("release", () => {
        if (lock === granted) {
          lock = null
        }
      })
      lock = granted
    } catch (e) {
      // the browser says no, to save the battery for one: the next use asks again
    }
    asking = false
    if (idleTimer === 0) {
      release() // not in use any more by now
    }
  }

  const used = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(release, idleMs)
    ask()
  }

  if (wakeLock) {
    // the browser takes the lock away when the page is hidden, and does not give it back by itself
    document.addEventListener("visibilitychange", ask)
  }

  return {used, release}
}
