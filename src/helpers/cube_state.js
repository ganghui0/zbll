// Minimal 3x3 model for smart cube training. It only knows face turns, which is all a smart cube reports:
// a wide move, a slice move or a whole-cube rotation reaches us as the face turns it is made of.
//
// Axes: x points to the R face, y to the U face, z to the F face.
// A slot is one sticker position: a cubie position plus the direction the sticker faces.
// A state lists, for every slot, the home slot of the sticker that is there now.

export const FACE_NORMALS = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
}
export const FACES = Object.keys(FACE_NORMALS)

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// v after a quarter turn that is clockwise when looking at the face with outward normal n
const turnCw = (v, n) => {
  const c = cross(n, v)
  const d = dot(n, v)
  return [n[0] * d - c[0], n[1] * d - c[1], n[2] * d - c[2]]
}

// {position, normal, face} of every slot; face is the face the slot is on
export const SLOTS = []
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      const position = [x, y, z]
      position.forEach((coordinate, axis) => {
        if (coordinate !== 0) {
          const normal = [0, 0, 0]
          normal[axis] = coordinate
          SLOTS.push({position, normal, face: FACES.find(face => `${FACE_NORMALS[face]}` === `${normal}`)})
        }
      })
    }
  }
}
const slotKey = (position, normal) => `${position}|${normal}`
const slotIndex = Object.fromEntries(SLOTS.map((slot, i) => [slotKey(slot.position, slot.normal), i]))

// quarterTurns[face][i] = the slot that the sticker in slot i moves to
const quarterTurns = Object.fromEntries(FACES.map(face => {
  const n = FACE_NORMALS[face]
  return [face, SLOTS.map(({position, normal}, i) =>
      dot(position, n) === 1 ? slotIndex[slotKey(turnCw(position, n), turnCw(normal, n))] : i)]
}))

const moveRegex = /^([URFDLB])(2|')?$/
const quarterTurnsCount = {"": 1, "2": 2, "'": 3}

// {face, quarterTurns: 1 to 3 clockwise quarter turns} or null if the move is not a face turn
export const parseMove = move => {
  const parsed = moveRegex.exec(move)
  return parsed && {face: parsed[1], quarterTurns: quarterTurnsCount[parsed[2] ?? ""]}
}

export const solvedState = () => SLOTS.map((_, i) => i)

export const isSolved = state => state.every((sticker, i) => sticker === i)

// returns a new state; move is a face turn like "R", "U2" or "F'"
export const applyMove = (state, move) => {
  const parsed = parseMove(move)
  if (!parsed) {
    throw new Error(`Not a face turn: "${move}"`)
  }
  const perm = quarterTurns[parsed.face]
  let result = state
  for (let n = parsed.quarterTurns; n > 0; n--) {
    const next = new Array(result.length)
    for (let i = 0; i < result.length; i++) {
      next[perm[i]] = result[i]
    }
    result = next
  }
  return result
}

export const applyAlg = (state, alg) => alg.split(" ").filter(Boolean).reduce(applyMove, state)

// the same alg with every face renamed by faceMap, e.g. {U: "D", F: "F", R: "L", ...}
export const mapAlg = (alg, faceMap) =>
    alg.split(" ").filter(Boolean).map(move => faceMap[move[0]] + move.slice(1)).join(" ")
