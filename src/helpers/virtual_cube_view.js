import {
  BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Scene, Shape, ShapeGeometry,
  Vector3, WebGLRenderer,
} from "three";
import {FACE_NORMALS, parseMove, SLOTS, solvedState} from "@/helpers/cube_state";

// the colors of the pictures of the cases (sr-puzzlegen), on a cube with white on top and green in front
const FACE_HEX = {U: 0xffffff, D: 0xffff00, F: 0x00ff00, B: 0x0000ff, R: 0xff0000, L: 0xffa500}
const BODY_HEX = 0x000000

const QUARTER_TURN_MS = 120
// with more turns than this waiting, the cube jumps to its latest state instead of replaying them
const MAX_WAITING_TURNS = 6
// the drawn orientation closes in on the reported one with this time constant; the gyro reports
// about 20 times a second, which is jerky when shown as it comes
const ORIENTATION_EASE_MS = 40

// a sticker nearly fills its side of the cubie, which leaves thin black lines like in the pictures
const stickerGeometry = () => {
  const half = 0.47
  const radius = 0.04
  const shape = new Shape()
  shape.moveTo(-half + radius, -half)
  shape.lineTo(half - radius, -half)
  shape.quadraticCurveTo(half, -half, half, -half + radius)
  shape.lineTo(half, half - radius)
  shape.quadraticCurveTo(half, half, half - radius, half)
  shape.lineTo(-half + radius, half)
  shape.quadraticCurveTo(-half, half, -half, half - radius)
  shape.lineTo(-half, -half + radius)
  shape.quadraticCurveTo(-half, -half, -half + radius, -half)
  return new ShapeGeometry(shape)
}

// A 3D drawing of a cube state (see cube_state.js). It does not keep track of the cube: it is told
// every state and only adds the turning of the layers in between.
export class VirtualCubeView {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new WebGLRenderer({canvas, antialias: true, alpha: true})
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(30, 1, 1, 50)
    this.camera.position.set(0, 0, 11)

    this.viewGroup = new Group() // the angle the cube is looked at from
    this.cubeGroup = new Group() // the orientation of the cube
    this.pivot = new Group() // holds the layer that is turning
    this.scene.add(this.viewGroup)
    this.viewGroup.add(this.cubeGroup)
    this.cubeGroup.add(this.pivot)

    this.geometries = [new BoxGeometry(1, 1, 1), stickerGeometry()]
    this.materials = [new MeshBasicMaterial({color: BODY_HEX})]
    this.cubies = [] // {group, position}
    this.stickers = [] // by slot: the mesh of the sticker that is drawn there
    const cubieAt = {}
    const outward = new Vector3(0, 0, 1)
    SLOTS.forEach(({position, normal}, slot) => {
      let cubie = cubieAt[position]
      if (!cubie) {
        cubie = cubieAt[position] = {group: new Group(), position}
        cubie.group.position.set(...position)
        cubie.group.add(new Mesh(this.geometries[0], this.materials[0]))
        this.cubeGroup.add(cubie.group)
        this.cubies.push(cubie)
      }
      const material = new MeshBasicMaterial()
      this.materials.push(material)
      const sticker = new Mesh(this.geometries[1], material)
      sticker.position.set(...normal).multiplyScalar(0.503)
      sticker.quaternion.setFromUnitVectors(outward, new Vector3(...normal))
      cubie.group.add(sticker)
      this.stickers[slot] = sticker
    })

    this.waiting = [] // {move, state}: turns still to be shown
    this.turning = null // {axis, angle, state, start, duration}
    this.targetOrientation = new Quaternion()
    this.easing = false
    this.idle = true // no frame is under way or requested
    this.lastFrame = 0
    this.frameRequest = 0
    this.frame = this.frame.bind(this)
    this.onVisibilityChange = () => this.requestFrame()
    document.addEventListener("visibilitychange", this.onVisibilityChange)

    this.color(solvedState())
    this.resize()
  }

  color(state) {
    state.forEach((sticker, slot) => this.stickers[slot].material.color.setHex(FACE_HEX[SLOTS[sticker].face]))
  }

  // shows the state at once
  setState(state) {
    this.waiting = []
    this.finishTurn(state)
    this.requestFrame()
  }

  // turns a layer; state is the state after the move
  addMove(move, state) {
    if (document.hidden) {
      this.setState(state) // nobody is looking, and no frames are drawn to turn it in
      return
    }
    this.waiting.push({move, state})
    this.requestFrame()
  }

  startTurn(now) {
    if (this.waiting.length > MAX_WAITING_TURNS) {
      const {state} = this.waiting[this.waiting.length - 1]
      this.waiting = []
      this.finishTurn(state)
      return
    }
    const {move, state} = this.waiting.shift()
    const {face, quarterTurns} = parseMove(move)
    const normal = FACE_NORMALS[face]
    // 3 clockwise quarter turns are drawn as one counterclockwise
    const clockwiseQuarters = quarterTurns === 3 ? -1 : quarterTurns
    this.turning = {
      axis: new Vector3(...normal),
      angle: -clockwiseQuarters * Math.PI / 2,
      state,
      start: now,
      // the more turns are waiting, the faster
      duration: QUARTER_TURN_MS * Math.abs(clockwiseQuarters) / (1 + this.waiting.length),
    }
    for (const cubie of this.cubies) {
      if (cubie.position[0] * normal[0] + cubie.position[1] * normal[1] + cubie.position[2] * normal[2] === 1) {
        this.pivot.add(cubie.group)
      }
    }
  }

  // ends the turn that is under way, if any, and shows the state
  finishTurn(state) {
    this.turning = null
    this.pivot.quaternion.identity()
    while (this.pivot.children.length > 0) {
      this.cubeGroup.add(this.pivot.children[0])
    }
    this.color(state)
  }

  // quat: [w, x, y, z], see cube_orientation.js
  setOrientation(quat, jump) {
    this.targetOrientation.set(quat[1], quat[2], quat[3], quat[0])
    if (jump || document.hidden) {
      this.cubeGroup.quaternion.copy(this.targetOrientation)
      this.easing = false
    } else {
      this.easing = true
    }
    this.requestFrame()
  }

  // the angle the cube is looked at from, in degrees: turned to the left or right, then tilted
  setView(yaw, pitch) {
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch * Math.PI / 180)
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw * Math.PI / 180)
    this.viewGroup.quaternion.copy(tilt).multiply(turn)
    this.requestFrame()
  }

  // to be called when the size of the canvas on the page has changed
  resize() {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width > 0 && height > 0) {
      this.renderer.setSize(width, height, false)
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
      this.requestFrame()
    }
  }

  // frames are only drawn while something changes
  requestFrame() {
    if (!this.frameRequest && !this.disposed) {
      if (this.idle) {
        this.idle = false
        this.lastFrame = performance.now()
      }
      this.frameRequest = requestAnimationFrame(this.frame)
    }
  }

  frame(now) {
    this.frameRequest = 0
    this.advance(now)
    this.renderer.render(this.scene, this.camera)
    if (this.turning || this.waiting.length > 0 || this.easing) {
      this.requestFrame()
    } else {
      this.idle = true
    }
  }

  // moves everything that is in motion to where it is at the given time
  advance(now) {
    const elapsed = Math.max(0, now - this.lastFrame)
    this.lastFrame = now
    while (true) {
      if (!this.turning) {
        if (this.waiting.length === 0) {
          break
        }
        this.startTurn(now)
        continue
      }
      const {axis, angle, state, start, duration} = this.turning
      const progress = duration > 0 ? (now - start) / duration : 1
      if (progress < 1) {
        this.pivot.quaternion.setFromAxisAngle(axis, angle * Math.max(0, progress))
        break
      }
      this.finishTurn(state)
    }
    if (this.easing) {
      const orientation = this.cubeGroup.quaternion
      orientation.slerp(this.targetOrientation, 1 - Math.exp(-elapsed / ORIENTATION_EASE_MS))
      if (orientation.angleTo(this.targetOrientation) < 0.001) {
        orientation.copy(this.targetOrientation)
        this.easing = false
      }
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frameRequest)
    document.removeEventListener("visibilitychange", this.onVisibilityChange)
    this.geometries.forEach(geometry => geometry.dispose())
    this.materials.forEach(material => material.dispose())
    this.renderer.dispose()
  }
}
