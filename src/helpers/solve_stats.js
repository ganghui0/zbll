// What a smart cube tells about a solve beyond its time. A result of the session stats (see SessionStore)
// that was solved with one has:
//   executionMs: from the first turn of the execution (see executionStart) to the last, as the cube reports them
//   recognitionMs: from the moment the case appeared to the first turn of the execution. Only when the timer
//     starts with the case (see the settings): then ms = recognitionMs + executionMs, else ms = executionMs.
//   moveCount: the turns of the execution in the half turn metric, see toMoves
//   turns: all turns as the cube reported them, like "R U R' U R U U R'", named for the cube as it was held
//     (U: the face on top). A wide move or a rotation is not seen as such: it renames the faces that follow.
//   turnTimesMs: when each of them was made, in ms after the first one
// A DNF has none of these, and neither have the results from before they were recorded.
// The turns and their times also tell how the solve ended, see finalAuf.
import {median} from "@/helpers/helpers";

// The top face is also turned to look at the case from another side, or to bring it to the side it is known
// from (a pre-AUF). That is recognition. Such a turn is followed by a pause, an AUF that the alg starts
// with is not.
const PRE_AUF_PAUSE_MS = 300

// turns: of a solve, named by position. times: when each of them was made, in ms.
// Returns the index of the turn that the execution starts with: the one after the last pause that follows
// nothing but turns of the top face, 0 without such a pause.
export const executionStart = (turns, times) => {
  let start = 0
  for (let i = 0; i + 1 < turns.length && turns[i][0] === "U"; i++) {
    if (times[i + 1] - times[i] >= PRE_AUF_PAUSE_MS) {
      start = i + 1
    }
  }
  return start
}

// how many turns of a result were made before its execution
export const turnsBeforeExecution = result => {
  const times = result.turnTimesMs
  const startMs = times[times.length - 1] - result.executionMs
  return times.findIndex(time => time >= startMs)
}

// The index of the turn that each move starts with. Two quarter turns the same way are one move, a double
// turn: most cubes report U2 as U U.
// ["R", "U", "U", "R'"] -> [0, 1, 3]
const moveStarts = turns => {
  const starts = []
  let open = false // the last move is a quarter turn, the same one again makes it a double turn
  turns.forEach((turn, i) => {
    if (open && turns[i - 1] === turn) {
      open = false
    } else {
      starts.push(i)
      open = !turn.endsWith("2")
    }
  })
  return starts
}

// The turns as moves, the half turn metric.
// ["R", "U", "U", "R'"] -> ["R", "U2", "R'"]
export const toMoves = turns => {
  const starts = moveStarts(turns)
  return starts.map((start, move) =>
      (starts[move + 1] ?? turns.length) - start === 2 ? turns[start][0] + "2" : turns[start])
}

export const countMoves = turns => toMoves(turns).length

export const hasSolveStats = result => !!result && !result.dnf && result.executionMs != null

// moves per second of the execution, or null for a solve of a single turn
export const turnsPerSecond = result =>
    hasSolveStats(result) && result.executionMs > 0 ? result.moveCount * 1000 / result.executionMs : null

// The AUF that ends a solve: the turns of the top face after the last turn of another face. Who knows the
// AUF that an alg ends with makes it as one more move of the alg. Who does not has to look at the cube
// first, and that shows: the AUF comes after a pause, or it is the wrong one and gets corrected (U' U2).
// Neither the recognition time nor the execution time tells the two apart.
export const Auf = Object.freeze({
  FLUENT: "fluent", // one move, right after the alg
  PAUSED: "paused", // one move, after a pause or (a double turn) with a pause in it
  CORRECTED: "corrected", // more than one move: U' U2, or U U' on a cube that was solved already
})

// A turn of the AUF comes after a pause when it takes this long, and not less than this many times the
// usual time from a move of the alg to the next one: turning slowly is not a pause.
const AUF_PAUSE_MS = 250
const AUF_PAUSE_MOVES = 2

// The AUF that ended the solve of a result: {start: the index of its first turn, moves: as they were made,
// like "U'" or "U' U2", ms: from the last turn of the alg to the last one of the AUF, kind: an Auf}.
// null for a solve that ended without an AUF, which does not tell whether one is known, and for a result
// without solve stats.
export const finalAuf = result => {
  if (!hasSolveStats(result)) {
    return null
  }
  const turns = result.turns.split(" ")
  const times = result.turnTimesMs
  let start = turns.length
  while (start > 0 && turns[start - 1][0] === "U") {
    start--
  }
  const algStart = turnsBeforeExecution(result)
  if (start === turns.length || start <= algStart) {
    return null
  }
  const algMoveTimes = moveStarts(turns.slice(algStart, start)).map(turn => times[algStart + turn])
  const usualMoveMs = algMoveTimes.length < 2 ? 0
      : median(algMoveTimes.slice(1).map((time, move) => time - algMoveTimes[move]))
  const pauseMs = Math.max(AUF_PAUSE_MS, AUF_PAUSE_MOVES * usualMoveMs)
  const paused = times.slice(start).some((time, turn) => time - times[start + turn - 1] >= pauseMs)
  const moves = toMoves(turns.slice(start))
  return {
    start,
    moves: moves.join(" "),
    ms: times[times.length - 1] - times[start - 1],
    kind: moves.length > 1 ? Auf.CORRECTED : paused ? Auf.PAUSED : Auf.FLUENT,
  }
}

// How many of the latest AUFs of a case tell whether its AUF is known. As with how weak a case is (see
// CaseHistoryStore), what it was like a while ago does not tell.
export const AUF_HISTORY_SIZE = 5

const aufKinds = results => results.map(finalAuf).filter(auf => auf !== null).map(auf => auf.kind)

const countFluent = kinds => ({count: kinds.length, fluent: kinds.filter(kind => kind === Auf.FLUENT).length})

// Of the solves that ended with an AUF: {count, fluent: how many of them with a fluent one}
export const summarizeAufs = results => countFluent(aufKinds(results))

// The same for the latest of them. results: of one case, the latest last.
export const latestAufs = results => countFluent(aufKinds(results).slice(-AUF_HISTORY_SIZE))

// The cases whose AUF is known least, by their latest AUFs: [{key, count, fluent}], the one with the most
// AUFs that were not fluent first. A case whose latest AUFs were all fluent is not among them.
// results: of any cases, the latest last.
export const leastFluentAufs = results => {
  const byCase = new Map()
  for (const result of results) {
    byCase.set(result.key, [...(byCase.get(result.key) ?? []), result])
  }
  return [...byCase]
      .map(([key, caseResults]) => ({key, ...latestAufs(caseResults)}))
      .filter(({count, fluent}) => fluent < count)
      .sort((a, b) => (b.count - b.fluent) - (a.count - a.fluent) || a.fluent - b.fluent)
}

const summary = (values, better) => {
  const known = values.filter(value => value != null)
  return known.length === 0 ? null : {
    mean: known.reduce((sum, value) => sum + value, 0) / known.length,
    best: known.reduce((best, value) => better(best, value)),
  }
}

// Of the results that have them: {count, time, recognition, execution, moves, tps, auf}, each one
// {mean, best} or null when no result has it. The times are in ms, auf is how long the AUFs took.
export const summarizeSolves = results => {
  const solves = results.filter(hasSolveStats)
  return {
    count: solves.length,
    time: summary(solves.map(solve => solve.ms), Math.min),
    recognition: summary(solves.map(solve => solve.recognitionMs), Math.min),
    execution: summary(solves.map(solve => solve.executionMs), Math.min),
    moves: summary(solves.map(solve => solve.moveCount), Math.min),
    tps: summary(solves.map(turnsPerSecond), Math.max),
    auf: summary(solves.map(solve => finalAuf(solve)?.ms), Math.min),
  }
}

export const formatTps = tps => tps == null ? "–" : tps.toFixed(1)

// the bootstrap class that gives the text about an AUF of this kind its color
export const aufTextClass = kind =>
    ({[Auf.FLUENT]: "text-success", [Auf.PAUSED]: "text-warning", [Auf.CORRECTED]: "text-danger"})[kind]
