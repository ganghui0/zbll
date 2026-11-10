// How the virtual cube of the smart cube trainer is turned on screen.
//
// Quaternions are [w, x, y, z]. An orientation turns cube coordinates (x: R face, y: U face, z: F face)
// into view coordinates (x: right, y: up, z: toward the viewer).
import {FACE_NORMALS, FACES} from "./cube_state.js";

export const qMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
]
export const qConj = q => [q[0], -q[1], -q[2], -q[3]]
// vector v turned by q
export const qRot = (q, v) => qMul(qMul(q, [0, v[0], v[1], v[2]]), qConj(q)).slice(1)
// degrees between two orientations
export const qAngle = (a, b) => Math.acos(Math.min(1, Math.abs(qMul(qConj(a), b)[0]))) * 360 / Math.PI
export const qNormalize = q => {
  const length = Math.hypot(...q)
  return length > 0 ? q.map(v => v / length) : null
}

// whole cube rotation by clockwise quarter turns, seen from the R (x), U (y) or F (z) face
const rotation = (axis, quarterTurns) => {
  const half = -quarterTurns * Math.PI / 4
  const q = [Math.cos(half), 0, 0, 0]
  q["xyz".indexOf(axis) + 1] = Math.sin(half)
  return q
}

// colors of a cube in its standard orientation
export const FACE_COLORS = {U: "white", D: "yellow", F: "green", B: "blue", R: "red", L: "orange"}

// For each cross color, the rotation from the standard orientation (white on top, green in front)
// that puts the cross at the bottom, so the last layer on top.
const HOME_ROTATIONS = {
  white: rotation("x", 2), // yellow on top, blue in front, like the pictures of the cases
  yellow: rotation("z", 0), // white on top, green in front
  red: rotation("z", 1), // orange on top, green in front
  orange: rotation("z", 3), // red on top, green in front
  green: rotation("x", 3), // blue on top, white in front
  blue: rotation("x", 1), // green on top, yellow in front
}
export const CROSS_COLORS = Object.keys(HOME_ROTATIONS)

// quat: an orientation with faces straight up and in front.
// Returns {quat, toCube}, toCube[P]: the face of the cube that is at position P (U: on top, F: in front, ...)
const describe = quat => {
  const toCube = {}
  for (const face of FACES) {
    const turned = qRot(quat, FACE_NORMALS[face]).map(Math.round)
    toCube[FACES.find(position => FACE_NORMALS[position].every((v, i) => v === turned[i]))] = face
  }
  return {quat, toCube}
}

// The four ways to hold the cube upright to solve a last layer with the given cross color, one for each
// side that can be in front. From one to the next the cube is turned like a y rotation.
export const homeOrientations = crossColor => {
  const first = HOME_ROTATIONS[crossColor] ?? HOME_ROTATIONS.white
  return [0, 1, 2, 3].map(quarterTurns => describe(qMul(rotation("y", quarterTurns), first)))
}

// index of the orientation that is closest to quat
export const nearestOrientation = (quat, orientations) =>
    orientations.reduce((best, {quat: other}, i) => qAngle(quat, other) < qAngle(quat, orientations[best].quat) ? i : best, 0)

// A smart cube reports x, y, z, w of its gyro with the sensor's y axis pointing to the B face and its z axis
// to the U face. Returns the orientation of the cube in the world (y: up), or null.
export const gyroQuaternion = ({x, y, z, w}) => qNormalize([w, x, z, -y])

export const GyroMode = Object.freeze({
  FOLLOW: 0,
  // Turn the view about the vertical only. Used after connecting, when the cube may lie anywhere.
  HEADING: 1,
  // Show the cube upright, whatever the hands do, until a face is turned or the whole cube is turned
  // quickly. Used for every new case, so that hands settling after the last solve do not tilt it.
  // This also clears the drift of the gyro about the vertical.
  HOLD: 2,
});

// at most this many degrees between two gyro reports (about 100 degrees a second) is a steady hand
const HOLD_STEP = 6
// a whole cube rotation turns at least this far from the steady orientation
const HOLD_TURN = 75

// Turns the reports of the gyro into the orientation to draw the cube in.
export const createGyroView = () => {
  let home = [1, 0, 0, 0] // the orientation that shows the cube upright
  let mode = GyroMode.HEADING
  let latest = null // latest report
  let toView = null // rotation from world coordinates to the view
  let holdBase = null // the last steady orientation while holding
  let holdStarted = false

  // Assume the face shown in front faces the user, or the one shown at the right when the front face
  // points up or down.
  const heading = quat => {
    const fromHome = qConj(home)
    const front = qRot(quat, qRot(fromHome, [0, 0, 1]))
    const right = qRot(quat, qRot(fromHome, [1, 0, 0]))
    const angle = Math.hypot(front[0], front[2]) >= Math.hypot(right[0], right[2])
        ? Math.atan2(front[0], front[2])
        : Math.atan2(right[0], right[2]) - Math.PI / 2
    return [Math.cos(angle / 2), 0, -Math.sin(angle / 2), 0]
  }

  // quat: the orientation of the cube in the world.
  // Returns {quat: the orientation to draw, jump: whether to show it at once instead of easing into it}.
  const update = quat => {
    const previous = latest
    latest = quat
    let jump = false
    if (mode === GyroMode.HOLD && !holdStarted) {
      holdStarted = true
      holdBase = quat
      toView = qMul(home, qConj(quat))
      jump = true
    } else if (holdBase) {
      if (qAngle(previous, quat) < HOLD_STEP) {
        holdBase = quat
      }
      if (mode === GyroMode.HOLD && qAngle(holdBase, quat) <= HOLD_TURN) {
        toView = qMul(home, qConj(quat)) // keep it upright
      } else {
        // let go: follow the gyro from the last steady orientation, so that a slice move or a cube
        // rotation that is under way is shown completely
        toView = qMul(home, qConj(holdBase))
        holdBase = null
        mode = GyroMode.FOLLOW
      }
    } else if (mode === GyroMode.HEADING || !toView) {
      toView = heading(quat)
      mode = GyroMode.FOLLOW
      jump = true
    }
    return {quat: qMul(toView, quat), jump}
  }

  return {
    update,
    // returns what update returns, or null before the first report
    setMode(newMode) {
      mode = newMode
      holdStarted = false
      if (newMode !== GyroMode.HOLD) {
        holdBase = null
      }
      return latest && update(latest) // show it at once
    },
    setHome(quat) {
      home = quat
    },
    // The cube turned out to be held differently than drawn: turn the drawing by quat.
    // Returns what update returns, or null before the first report.
    turnView(quat) {
      if (!latest || !toView) {
        return null
      }
      toView = qMul(quat, toView)
      return {quat: qMul(toView, latest), jump: true}
    },
    // forget the reports so far, for another cube
    reset() {
      mode = GyroMode.HEADING
      latest = toView = holdBase = null
      holdStarted = false
    },
    // a face of the cube was turned: stop holding with the next report
    faceTurned() {
      if (mode === GyroMode.HOLD) {
        mode = GyroMode.FOLLOW
      }
    },
  }
}
