// What an alg does to a cube that stays as it is held, and from which side a scramble shows its case.
import {applyAlg, isSolved, solvedState} from "@/helpers/cube_state";

// A quarter turn of the whole cube: the place each face comes to gets the face that was at the other place.
// x turns like R, y like U, z like F.
const ROTATIONS = {
  x: {U: "F", B: "U", D: "B", F: "D"},
  y: {L: "F", B: "L", R: "B", F: "R"},
  z: {R: "U", D: "R", L: "D", U: "L"},
}

// A wide move, a slice move or a rotation is a rotation of the whole cube and the turn of other faces:
// [faces that turn the same way, faces that turn the other way, the rotation, the same way (1) or the other (-1)]
// r = L x, M = R L' x'
const COMPOUND = {
  r: ["L", "", "x", 1], l: ["R", "", "x", -1],
  u: ["D", "", "y", 1], d: ["U", "", "y", -1],
  f: ["B", "", "z", 1], b: ["F", "", "z", -1],
  M: ["R", "L", "x", -1], E: ["U", "D", "y", -1], S: ["B", "F", "z", 1],
  x: ["", "", "x", 1], y: ["", "", "y", 1], z: ["", "", "z", 1],
}

const moveRegex = /^([URFDLB]w?|[urfdlbMESxyz])(\d?)('?)$/
const SUFFIXES = ["", "", "2", "'"] // by the number of clockwise quarter turns

// The face turns that leave the pieces of the cube where the alg leaves them, for a cube that is not turned
// around as a whole: the faces are named as the cube was held before the alg.
// "y R U R'" -> "B U B'", "r U r'" -> "L F L'"
// Throws on a move it does not know. Brackets are left out.
export const toFaceTurns = alg => {
  let held = {U: "U", R: "R", F: "F", D: "D", L: "L", B: "B"} // the face that is at each place now
  const turns = []
  const turn = (faces, quarterTurns) => {
    for (const face of faces) {
      turns.push(held[face] + SUFFIXES[quarterTurns])
    }
  }
  for (const move of alg.replace(/[()]/g, " ").split(" ").filter(Boolean)) {
    const parsed = moveRegex.exec(move)
    if (!parsed) {
      throw new Error(`Not a move: "${move}"`)
    }
    let quarterTurns = (parsed[2] === "" ? 1 : parseInt(parsed[2])) % 4
    if (parsed[3]) {
      quarterTurns = (4 - quarterTurns) % 4
    }
    if (quarterTurns === 0) {
      continue
    }
    const name = parsed[1].length === 2 ? parsed[1][0].toLowerCase() : parsed[1] // Rw is r
    if (!COMPOUND[name]) {
      turn(name, quarterTurns)
      continue
    }
    const [sameWay, otherWay, axis, direction] = COMPOUND[name]
    turn(sameWay, quarterTurns)
    turn(otherWay, 4 - quarterTurns)
    for (let n = direction === 1 ? quarterTurns : 4 - quarterTurns; n > 0; n--) {
      const before = held
      held = {...before}
      for (const [place, from] of Object.entries(ROTATIONS[axis])) {
        held[place] = before[from]
      }
    }
  }
  return turns.join(" ")
}

const Y_TURNS = ["", "y", "y2", "y'"]
const AUFS = ["", "U", "U2", "U'"]

// the y turns in front of an alg, 0 to 3
const yTurnsOf = alg => Y_TURNS.indexOf(/^y[2']?(?= |$)/.exec(alg)?.[0] ?? "")

// An alg is written for one side of its case: the "y" in front of it tells how to hold the cube when the
// case looks like its picture in the list of cases. A scramble shows the case from any side.
// Returns the side that this scramble shows the case of these algs from: the number of y turns, 0 to 3,
// that the algs need on top of their own. 0 if that cannot be found out.
export const sideOfCase = (scramble, algs) => {
  try {
    const scrambled = applyAlg(solvedState(), scramble)
    const sides = [0, 1, 2, 3].filter(side => {
      const state = applyAlg(scrambled, toFaceTurns(`${Y_TURNS[side]} ${algs[0]}`))
      return AUFS.some(auf => isSolved(applyAlg(state, auf)))
    })
    // a case that looks the same from several sides: the one that the first alg needs no y turn for
    return sides.find(side => (yTurnsOf(algs[0]) + side) % 4 === 0) ?? sides[0] ?? 0
  } catch (e) {
    console.warn("[algs]", e)
    return 0
  }
}

// The alg for its case seen from that side, see sideOfCase.
// ("y2 R U R'", 1) -> "y' R U R'"
export const fromSide = (alg, side) => {
  const own = yTurnsOf(alg)
  return `${Y_TURNS[(own + side) % 4]} ${alg.slice(Y_TURNS[own].length).trim()}`.trim()
}
