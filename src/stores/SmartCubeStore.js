import {defineStore} from 'pinia'
import {computed, ref, shallowRef, watch} from "vue";
import {connectSmartCube, cubeTimestampLinearFit, now} from "smartcube-web-bluetooth";
import {TimerState, useSessionStore} from "@/stores/SessionStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {applyAlg, applyMove, isSolved, mapAlg, parseMove, solvedState} from "@/helpers/cube_state";
import {
    createGyroView, GyroMode, gyroQuaternion, homeOrientations, nearestOrientation, qConj, qMul,
} from "@/helpers/cube_orientation";

// The next case is shown once the cube has been left alone for this long, so that a turn right after a
// solve (a mispredicted AUF, say) does not land on the new case.
const NEXT_CASE_DELAY_MS = 500
// A solve only counts when the solved cube is not turned again within this time (most turns within an alg
// follow each other faster). Solving the case and then doing a wrong AUF does not count: the AUF has to be fixed.
const SOLVE_CONFIRM_MS = 400
// The turns of a gesture (see countTurn) follow each other within this time.
const GESTURE_MS = 1500
// A gesture is a face turned all the way around.
const GESTURE_QUARTER_TURNS = 4
// The cube's clock is fitted to ours to time a solve. A fit that disagrees with the cube's clock by more
// than this is a bad fit (too few turns), not a clock that is this far off.
const MAX_CLOCK_SKEW = 0.05

export const ConnectionStatus = Object.freeze({
    DISCONNECTED: "disconnected",
    CONNECTING: "connecting",
    CONNECTED: "connected",
});

const Gesture = Object.freeze({START: "start", STOP: "stop"})

export const Phase = Object.freeze({
    PAUSED: "paused", // turns are not timed
    PENDING: "pending", // the next case is about to be shown
    SHOWN: "shown", // the case is on the virtual cube and the cube has not been turned yet
    SOLVING: "solving",
    CONFIRMING: "confirming", // solved, see SOLVE_CONFIRM_MS
});

// Training with a bluetooth cube. The cube is never scrambled: the case is put on a virtual cube, which
// then follows every turn of the real one until it is solved. The real cube has to be held like the
// virtual one: with the cross color at the bottom and, to see the turns on the right faces, with the same
// side in front.
export const useSmartCubeStore = defineStore('smartCube', () => {
    const session = useSessionStore()
    const settings = useSettingsStore()

    const supported = typeof navigator !== "undefined" && !!navigator.bluetooth

    const status = ref(ConnectionStatus.DISCONNECTED)
    const statusMessage = ref("") // progress of connecting
    const deviceName = ref("")
    const battery = ref(null) // percent
    const connected = computed(() => status.value === ConnectionStatus.CONNECTED)

    const phase = ref(Phase.PAUSED)
    const caseActive = computed(() =>
        phase.value === Phase.SHOWN || phase.value === Phase.SOLVING || phase.value === Phase.CONFIRMING)
    // cases keep coming, as opposed to waiting for a key press
    const training = computed(() => connected.value && phase.value !== Phase.PAUSED)

    // The ways the cube can be held, one for each side in front, and the one it is held in as far as
    // we know. We only find out for sure when a case gets solved.
    const homes = computed(() => homeOrientations(settings.store.smartCubeCrossColor))
    let front = 0
    const home = () => homes.value[front]

    // The virtual cube. Its state is that of a cube in the standard orientation (white on top, green in
    // front), as the real cube names its turns.
    let cubeState = solvedState()
    // what to draw: the state, and the turn that led to it or null to show it at once
    const cubeDrawing = shallowRef({state: cubeState, move: null})
    // how to turn the drawing, see cube_orientation.js. It follows the gyro of the cube, if it has one.
    const cubeOrientation = shallowRef({quat: home().quat, jump: true})
    const gyroView = createGyroView()
    let gyroSeen = false

    const setCubeState = state => {
        cubeState = state
        cubeDrawing.value = {state, move: null}
    }

    const showUpright = mode => {
        const shown = gyroView.setMode(mode)
        cubeOrientation.value = shown ?? {quat: home().quat, jump: true}
    }

    // the cube is held with another side in front than we thought
    const setFront = newFront => {
        const turned = gyroView.turnView(qMul(homes.value[newFront].quat, qConj(home().quat)))
        front = newFront
        gyroView.setHome(home().quat)
        cubeOrientation.value = turned ?? {quat: home().quat, jump: true}
    }

    let connection = null
    let subscription = null
    let caseStart = cubeState
    // The case for each way the cube can be held. The turns go to all of them, and the case is solved
    // when one of them is: the one of the side that really was in front.
    let candidates = []
    let solvedFront = 0
    let turnLog = [] // {move, cubeTimestamp, localTimestamp, arrivedAt} of the current case
    let shownAt = 0
    let nextCaseTimer = 0
    let confirmTimer = 0

    // Gestures, for hands that stay on the cube: a face turned all the way around in one direction, which
    // leaves the cube as it was and is in no alg. The top face clockwise (U U U U) starts the training like
    // the space bar, the bottom face counterclockwise (D' D' D' D') stops it like the escape key.
    // The latest turns, as long as they turn one face one way: {face, direction: 1 clockwise, -1
    // counterclockwise, 0 not known (half turns only), quarterTurns, at: when the last one arrived}
    let sameTurns = null
    // Counts a turn, returns the gesture that it completes or null.
    const countTurn = (move, at) => {
        const {face, quarterTurns} = parseMove(move)
        const direction = [0, 1, 0, -1][quarterTurns] // some cubes report a fast U U as U2
        const follows = sameTurns !== null && sameTurns.face === face && at - sameTurns.at <= GESTURE_MS
            && sameTurns.direction * direction >= 0
        sameTurns = {
            face,
            direction: (follows && sameTurns.direction) || direction,
            quarterTurns: (follows ? sameTurns.quarterTurns : 0) + (direction === 0 ? 2 : 1),
            at,
        }
        if (sameTurns.quarterTurns < GESTURE_QUARTER_TURNS) {
            return null
        }
        const turned = sameTurns.direction
        sameTurns = null
        if (!settings.store.smartCubeGestures) {
            return null
        }
        const {toCube} = home() // the faces by position, U for the one held on top
        if (face === toCube.U && turned >= 0) {
            return Gesture.START
        }
        return face === toCube.D && turned <= 0 ? Gesture.STOP : null
    }
    // The time of a solve that was waiting to be confirmed when the cube was turned again, or null. If that
    // turn opens the stop gesture, the solve counts after all.
    let interruptedSolveMs = null

    const clearTimers = () => {
        clearTimeout(nextCaseTimer)
        clearTimeout(confirmTimer)
        nextCaseTimer = confirmTimer = 0
    }

    const pause = () => {
        clearTimers()
        sameTurns = null
        phase.value = Phase.PAUSED
        session.frozenMs = null
        session.timerState = TimerState.NOT_RUNNING
    }

    const showCase = () => {
        nextCaseTimer = 0
        if (!session.currentScramble) {
            pause()
            return
        }
        // with a gyro: the side that faces the user now
        front = nearestOrientation(cubeOrientation.value.quat, homes.value)
        gyroView.setHome(home().quat)
        // the scramble is written for a cube with the last layer on top
        candidates = homes.value.map(({toCube}) => applyAlg(solvedState(), mapAlg(session.currentScramble, toCube)))
        caseStart = candidates[front]
        setCubeState(caseStart)
        showUpright(GyroMode.HOLD)
        turnLog = []
        interruptedSolveMs = null
        shownAt = now()
        phase.value = Phase.SHOWN
        session.frozenMs = null
        if (settings.store.smartCubeTimeRecognition) {
            session.startTimer()
        } else {
            session.timerState = TimerState.READY // the first turn starts the timer
        }
    }

    const scheduleNextCase = () => {
        clearTimers()
        phase.value = Phase.PENDING
        nextCaseTimer = setTimeout(showCase, NEXT_CASE_DELAY_MS)
    }

    const start = () => {
        if (connected.value && phase.value === Phase.PAUSED && session.currentScramble) {
            scheduleNextCase()
        }
    }

    // time from the first to the last turn of the current case
    const executionMs = () => {
        const first = turnLog[0]
        const last = turnLog[turnLog.length - 1]
        const byArrival = last.arrivedAt - first.arrivedAt
        if (turnLog.some(turn => turn.cubeTimestamp == null)) {
            return byArrival
        }
        // Turns reach us in bursts, the cube's own timestamps are evenly clocked but that clock runs a bit
        // fast or slow. The fit gives the cube's timestamps at the pace of our clock.
        const byCube = last.cubeTimestamp - first.cubeTimestamp
        const fitted = cubeTimestampLinearFit(turnLog.map(turn => ({...turn})))
        const byFit = fitted[fitted.length - 1].cubeTimestamp
        return Number.isFinite(byFit) && Math.abs(byFit - byCube) <= byCube * MAX_CLOCK_SKEW ? byFit : byCube
    }

    const solveMs = () => {
        const recognitionMs = settings.store.smartCubeTimeRecognition ? Math.max(0, turnLog[0].arrivedAt - shownAt) : 0
        return Math.round(recognitionMs + executionMs())
    }

    const confirmSolve = () => {
        clearTimers()
        const ms = session.frozenMs
        session.frozenMs = null
        if (solvedFront !== front) {
            setFront(solvedFront)
            setCubeState(candidates[front])
        }
        session.recordResult(ms)
        session.timerState = TimerState.NOT_RUNNING
        scheduleNextCase()
    }

    const onTurn = event => {
        const move = `${event.move}`.trim()
        let turned
        try {
            turned = applyMove(cubeState, move)
        } catch (e) {
            console.warn("[smart cube] ignored", event)
            return
        }
        // the virtual cube follows every turn, also the ones that are not timed
        cubeState = turned
        cubeDrawing.value = {state: turned, move}
        gyroView.faceTurned()

        const gesture = countTurn(move, event.timestamp)
        if (phase.value === Phase.PAUSED) {
            if (gesture === Gesture.START) {
                start()
            }
            return
        }
        const stop = gesture === Gesture.STOP
        if (phase.value === Phase.PENDING) {
            if (stop) {
                pause()
            } else {
                scheduleNextCase() // not left alone yet
            }
            return
        }
        if (phase.value === Phase.SHOWN && session.timerState !== TimerState.RUNNING) {
            session.startTimer()
        }
        if (phase.value === Phase.CONFIRMING) { // turned again right after the solved state: go on solving
            interruptedSolveMs = session.frozenMs
            clearTimers()
            session.frozenMs = null
        }
        phase.value = Phase.SOLVING
        candidates = candidates.map(state => applyMove(state, move))
        turnLog.push({
            move,
            cubeTimestamp: event.cubeTimestamp,
            localTimestamp: event.localTimestamp, // null for a turn that was recovered after a lost packet
            arrivedAt: event.timestamp,
        })
        if (stop) {
            if (interruptedSolveMs !== null && isSolved(candidates[solvedFront])) {
                // the gesture left the cube as it was, solved: the case counts, with the time it had then
                phase.value = Phase.CONFIRMING
                session.frozenMs = interruptedSolveMs
            }
            endAttempt(false)
            return
        }
        const solved = candidates.flatMap((state, i) => isSolved(state) ? [i] : [])
        if (solved.length > 0) {
            // a case that looks the same from several sides is solved for several of them
            solvedFront = solved.includes(front) ? front : solved[0]
            phase.value = Phase.CONFIRMING
            sameTurns = null // the turn that solved the case is not part of a gesture
            session.frozenMs = solveMs() // shown already, but only counts once confirmed
            confirmTimer = setTimeout(confirmSolve, SOLVE_CONFIRM_MS)
        }
    }

    const onGyro = event => {
        const quat = gyroQuaternion(event.quaternion)
        if (quat) {
            gyroSeen = true
            cubeOrientation.value = gyroView.update(quat)
        }
    }

    // The attempt ends here and the trainer pauses.
    // record: keep it in the stats as a DNF, which also puts its algs on screen. The virtual cube goes
    // back to the case, so that the algs can be tried on it.
    const endAttempt = record => {
        if (!caseActive.value) {
            return
        }
        if (phase.value === Phase.CONFIRMING) { // already solved, no need to wait for the confirmation
            confirmSolve()
        } else if (record) {
            session.recordResult(turnLog.length > 0 ? now() - turnLog[0].arrivedAt : 0, true)
            setCubeState(caseStart)
        } else {
            session.skipCase() // the case has been seen
            setCubeState(solvedState())
        }
        pause()
    }

    // Space or a tap: start and pause; during a case: give up. Escape: drop the attempt without a trace.
    // Returns whether the key was used.
    const handleKey = key => {
        if (!connected.value || (key !== " " && key !== "Escape")) {
            return false
        }
        if (caseActive.value) {
            endAttempt(key === " ")
        } else if (phase.value === Phase.PENDING) {
            pause()
        } else if (key === " ") {
            start()
        } else {
            return false
        }
        return true
    }

    // another cross color
    watch(homes, () => {
        if (connected.value) {
            endAttempt(false)
            pause()
        }
        front = 0
        gyroView.setHome(home().quat)
        setCubeState(solvedState())
        showUpright(gyroSeen ? GyroMode.HOLD : GyroMode.FOLLOW)
    })

    // The user says the cube is held upright now, with the side in front that the drawing has in front.
    const recenter = () => {
        front = nearestOrientation(cubeOrientation.value.quat, homes.value)
        gyroView.setHome(home().quat)
        showUpright(GyroMode.HOLD)
    }

    const detach = () => {
        subscription?.unsubscribe()
        subscription = null
        connection = null
        status.value = ConnectionStatus.DISCONNECTED
        statusMessage.value = ""
        endAttempt(false)
        pause()
    }

    const onCubeEvent = event => {
        if (event.type === "MOVE") {
            onTurn(event)
        } else if (event.type === "GYRO") {
            onGyro(event)
        } else if (event.type === "BATTERY") {
            battery.value = event.batteryLevel
        } else if (event.type === "DISCONNECT") {
            detach()
        }
    }

    // newConnection: a SmartCubeConnection of smartcube-web-bluetooth
    const attach = newConnection => {
        connection = newConnection
        deviceName.value = newConnection.deviceName
        battery.value = null
        status.value = ConnectionStatus.CONNECTED
        statusMessage.value = ""
        pause()
        // we do not know the state of the real cube, and do not need to
        setCubeState(solvedState())
        gyroSeen = false
        sameTurns = null
        front = 0
        gyroView.setHome(home().quat)
        gyroView.reset()
        cubeOrientation.value = {quat: home().quat, jump: true}
        subscription = newConnection.events$.subscribe(onCubeEvent)
        if (newConnection.capabilities.battery) {
            newConnection.sendCommand({type: "REQUEST_BATTERY"}).catch(() => {})
        }
    }

    // Must be called from a click or a key press, the browser shows its device chooser.
    // askMacAddress(deviceName): asks the user for the cube's bluetooth address, returns it or null.
    // Some cubes encrypt their data with it, and it is only asked for when it cannot be found out.
    const connect = async askMacAddress => {
        if (status.value !== ConnectionStatus.DISCONNECTED) {
            return
        }
        status.value = ConnectionStatus.CONNECTING
        try {
            attach(await connectSmartCube({
                enableAddressSearch: true,
                onStatus: message => statusMessage.value = message,
                macAddressProvider: async (device, isFallbackCall) =>
                    isFallbackCall ? (askMacAddress?.(device.name) ?? null) : null,
            }))
        } catch (e) {
            status.value = ConnectionStatus.DISCONNECTED
            statusMessage.value = ""
            throw e
        }
    }

    const disconnect = () => {
        const closing = connection
        detach()
        closing?.disconnect().catch(() => {})
    }

    return {
        supported, status, statusMessage, deviceName, battery, connected, connect, disconnect, attach,
        phase, caseActive, training, handleKey, pause, cubeDrawing, cubeOrientation, recenter,
    }
});
