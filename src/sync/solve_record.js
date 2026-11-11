// A solve as it is kept in the stats file in Google Drive.
// An entry is a result of the session stats, see SessionStore.

export const SolveInput = Object.freeze({
  KEYBOARD: "keyboard",
  TOUCH: "touch",
  SMART_CUBE: "smart_cube",
});

export const newSolveId = () => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")
}

// cyrb53, a small string hash
const hash = text => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0")
}

// Results from before solves had ids get one made of what they are, so that every tab that has them
// gives them the same one.
export const legacySolveId = (entry, origin = location.origin) =>
    "legacy-" + hash([origin, entry.i, entry.key, entry.scramble, entry.ms, !!entry.dnf].join("|"))

// "T BBFF AsA" -> "T"
export const caseSet = key => `${key}`.split(" ")[0]

// What is not known is null: results from before solves were synced have no time, input or cross color,
// and the cross color is only known for a smart cube.
export const toSolveRecord = (entry, origin = location.origin) => ({
  id: entry.id,
  timestamp: entry.timestamp ?? null,
  caseKey: entry.key,
  set: caseSet(entry.key),
  timeMs: entry.ms,
  dnf: !!entry.dnf,
  scramble: entry.scramble,
  input: entry.input ?? null,
  crossColor: entry.crossColor ?? null,
  origin,
})
