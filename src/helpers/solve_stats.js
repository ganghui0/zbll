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

// The turns with a double turn as one move, the half turn metric: most cubes report U2 as U U.
// ["R", "U", "U", "R'"] -> ["R", "U2", "R'"]
export const toMoves = turns => {
  const moves = []
  let open = false // the last move is a quarter turn, the same one again makes it a double turn
  for (const turn of turns) {
    if (open && moves[moves.length - 1] === turn) {
      moves[moves.length - 1] = turn[0] + "2"
      open = false
    } else {
      moves.push(turn)
      open = !turn.endsWith("2")
    }
  }
  return moves
}

export const countMoves = turns => toMoves(turns).length

export const hasSolveStats = result => !!result && !result.dnf && result.executionMs != null

// moves per second of the execution, or null for a solve of a single turn
export const turnsPerSecond = result =>
    hasSolveStats(result) && result.executionMs > 0 ? result.moveCount * 1000 / result.executionMs : null

const summary = (values, better) => {
  const known = values.filter(value => value != null)
  return known.length === 0 ? null : {
    mean: known.reduce((sum, value) => sum + value, 0) / known.length,
    best: known.reduce((best, value) => better(best, value)),
  }
}

// Of the results that have them: {count, time, recognition, execution, moves, tps}, each one {mean, best}
// or null when no result has it. The times are in ms.
export const summarizeSolves = results => {
  const solves = results.filter(hasSolveStats)
  return {
    count: solves.length,
    time: summary(solves.map(solve => solve.ms), Math.min),
    recognition: summary(solves.map(solve => solve.recognitionMs), Math.min),
    execution: summary(solves.map(solve => solve.executionMs), Math.min),
    moves: summary(solves.map(solve => solve.moveCount), Math.min),
    tps: summary(solves.map(turnsPerSecond), Math.max),
  }
}

export const formatTps = tps => tps == null ? "–" : tps.toFixed(1)
