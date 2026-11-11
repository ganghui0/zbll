import {defineStore} from 'pinia'
import {computed, reactive, ref, watch} from "vue";
import {GOOGLE_CLIENT_ID} from "@/config";
import * as auth from "@/sync/google_auth";
import * as queue from "@/sync/sync_queue";
import {fetchEmail} from "@/sync/drive_api";
import {pushRecords} from "@/sync/drive_push";
import {toSolveRecord} from "@/sync/solve_record";

const savedKey = "zbll_drive_sync"
// only one tab at a time reads and writes the stats file
const LOCK_NAME = "zbll_drive_sync"
// A result is pushed this long after the last one, so results that follow each other closely go together...
const DEBOUNCE_MS = 3000
// ...but no later than this after the first one, when they keep coming.
const MAX_WAIT_MS = 15000
// What was written is looked for in the file once more after this time, see sync_queue.js.
const CONFIRM_MS = 30000
const STARTUP_MS = 3000
const RETRY_MIN_MS = 5000
const RETRY_MAX_MS = 5 * 60000

export const SyncProblem = Object.freeze({
    OFFLINE: "offline", // Google does not answer
    DRIVE: "drive", // Google Drive answers with an error
    FILE: "file", // the stats file cannot be read as one
    STORAGE: "storage", // a result could not be put in the queue
});

// Sync of every solve to a file in the user's Google Drive, in the background. The session store hands
// in each result and each deletion. They are queued in localStorage and pushed a few seconds later, and
// stay queued for as long as that fails. Nothing here waits in the way of the timer.
export const useDriveSyncStore = defineStore('driveSync', () => {
    const configured = GOOGLE_CLIENT_ID !== ""

    // The same in all tabs, through localStorage. enabled: the user is signed in (the access token may
    // have run out). lastSyncedAt: ISO time.
    const loadSaved = () => {
        let stored = null
        try {
            stored = JSON.parse(localStorage.getItem(savedKey))
        } catch (e) {
            // start over
        }
        return {enabled: false, email: "", lastSyncedAt: null, ...stored}
    }
    const saved = reactive(loadSaved())
    const save = changes => {
        Object.assign(saved, changes)
        localStorage.setItem(savedKey, JSON.stringify(saved))
    }
    const enabled = computed(() => configured && saved.enabled)

    const waiting = ref(queue.countWaiting()) // results that are not in Drive yet
    const syncing = ref(false)
    const signingIn = ref(false)
    const problem = ref(null) // a SyncProblem while the last push failed, it is tried again
    // A new access token could not be had without the user: nothing is pushed until they sign in again.
    const signInNeeded = ref(false)
    const needsSignIn = computed(() => enabled.value && signInNeeded.value)
    let silentFailure = null // why, the code of the AuthError
    // then the click on "sign in again" can open Google's window right away
    watch(needsSignIn, needed => needed && auth.loadSignIn().catch(() => {}))

    let timer = 0
    let pendingSince = 0
    let retryDelay = RETRY_MIN_MS
    let running = false
    let rerun = null // {always} when a push was asked for while one was running

    const scheduleAt = delay => {
        clearTimeout(timer)
        timer = setTimeout(push, delay)
    }
    const scheduleSoon = () => {
        const now = Date.now()
        pendingSince ||= now
        scheduleAt(Math.max(0, Math.min(now + DEBOUNCE_MS, pendingSince + MAX_WAIT_MS) - now))
    }
    const unschedule = () => {
        clearTimeout(timer)
        timer = pendingSince = 0
    }

    let renewing = null
    // Returns an access token. Throws {kind: "signin"} when that takes the user, {kind: "offline"}.
    const accessToken = async () => {
        const token = auth.storedToken()
        if (token) {
            return token
        }
        if (signInNeeded.value) {
            throw {kind: "signin"}
        }
        if (navigator.onLine === false) {
            throw {kind: "offline"}
        }
        try {
            renewing ??= auth.renewSilently(saved.email).finally(() => renewing = null)
            const renewed = await renewing
            auth.storeToken(renewed)
            return renewed.token
        } catch (e) {
            if (navigator.onLine === false) {
                throw {kind: "offline"}
            }
            silentFailure = e.code ?? "unknown"
            signInNeeded.value = true
            throw {kind: "signin"}
        }
    }

    const pushWithToken = async records => {
        try {
            return await pushRecords(await accessToken(), records)
        } catch (e) {
            if (e.kind !== "auth") {
                throw e
            }
            auth.forgetToken() // Google does not take it any more
            return await pushRecords(await accessToken(), records)
        }
    }

    // Brings the queue into the stats file. always: also with an empty queue, which makes the file.
    const push = async ({always = false} = {}) => {
        unschedule()
        if (!enabled.value) {
            return
        }
        if (running) {
            rerun = {always: always || !!rerun?.always}
            return
        }
        running = true
        let pushed = false
        try {
            const run = async () => {
                const items = queue.readQueue()
                if (items.length === 0 && !always) {
                    return
                }
                syncing.value = true
                const {sent, confirmed} = await pushWithToken(items.map(item => item.record))
                const sentAt = new Date().toISOString()
                const byId = new Map(items.map(item => [item.record.id, item]))
                confirmed.forEach(id => queue.removeItem(byId.get(id)))
                sent.forEach(id => queue.markSent(byId.get(id), sentAt))
                pushed = true
            }
            // not in all browsers: without it only this tab takes turns
            await (navigator.locks ? navigator.locks.request(LOCK_NAME, run) : run())
            if (pushed) {
                problem.value = null
                retryDelay = RETRY_MIN_MS
                if (saved.enabled) { // not signed out meanwhile
                    save({lastSyncedAt: new Date().toISOString()})
                }
            }
        } catch (e) {
            if (e.kind === "auth") { // a fresh token was refused as well
                auth.forgetToken()
                silentFailure = "refused"
                signInNeeded.value = true
            } else if (e.kind !== "signin") {
                problem.value = e.kind === "offline" ? SyncProblem.OFFLINE
                    : e.kind === "file" ? SyncProblem.FILE : SyncProblem.DRIVE
                if (e.kind !== "offline") {
                    console.error("[drive sync]", e)
                }
                scheduleAt(retryDelay)
                retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
            }
        } finally {
            running = false
            syncing.value = false
            const left = queue.readQueue()
            waiting.value = left.filter(item => item.sentAt === null).length
            if (rerun) {
                const {always: again} = rerun
                rerun = null
                again ? push({always: true}) : scheduleSoon()
            } else if (pushed && left.length > 0 && timer === 0) {
                scheduleAt(CONFIRM_MS + Math.random() * 5000)
            }
        }
    }

    const add = records => {
        if (!enabled.value || records.length === 0) {
            return
        }
        try {
            records.forEach(queue.putRecord)
        } catch (e) { // the storage is full
            console.error("[drive sync]", e)
            problem.value = SyncProblem.STORAGE
        }
        waiting.value = queue.countWaiting()
        scheduleSoon()
    }

    // entries: results of the session stats, see SessionStore. They have an id.
    const queueSolves = entries => add(entries.map(entry => toSolveRecord(entry)))

    const queueDeletion = entry => add([{...toSolveRecord(entry), deleted: true, deletedAt: new Date().toISOString()}])

    // Before the click on "sign in", see auth.signIn.
    const prepareSignIn = () => {
        if (configured) {
            auth.loadSignIn().catch(() => {})
        }
    }

    // Must be called from a click. Returns null, or why it did not work: the code of the AuthError.
    const signIn = async () => {
        if (!configured || signingIn.value) {
            return null
        }
        signingIn.value = true
        try {
            const token = await auth.signIn(saved.email)
            auth.storeToken(token)
            signInNeeded.value = false
            problem.value = null
            save({enabled: true, email: (await fetchEmail(token.token)) ?? saved.email})
            push({always: true})
            return null
        } catch (e) {
            return e.code ?? "unknown"
        } finally {
            signingIn.value = false
        }
    }

    // Stops the sync in this browser. The results that wait are kept for the next sign in.
    const signOut = () => {
        unschedule()
        auth.forgetToken()
        signInNeeded.value = false
        problem.value = null
        save({enabled: false, email: "", lastSyncedAt: null})
    }

    let counting = 0
    window.addEventListener("storage", event => {
        if (event.storageArea !== localStorage) {
            return
        }
        if (event.key === savedKey || event.key === null) { // signed in or out in another tab
            Object.assign(saved, loadSaved())
            if (!saved.enabled) {
                unschedule()
                signInNeeded.value = false
            }
        }
        if (queue.isQueueKey(event.key) || event.key === null) {
            clearTimeout(counting) // they can come by the hundreds
            counting = setTimeout(() => waiting.value = queue.countWaiting(), 200)
        }
        if (auth.isTokenKey(event.key) && auth.storedToken() && signInNeeded.value) { // signed in again in another tab
            signInNeeded.value = false
            scheduleSoon()
        }
    })

    window.addEventListener("online", () => {
        if (!enabled.value) {
            return
        }
        if (silentFailure === "timeout") { // may have been the connection
            signInNeeded.value = false
        }
        if (queue.readQueue().length > 0) {
            // not all at once: tabs of other sites that sync to the same file do not take turns with this one
            scheduleAt(Math.random() * 3000)
        }
    })

    if (enabled.value && queue.readQueue().length > 0) { // left from last time
        scheduleAt(STARTUP_MS)
    }

    return {
        configured, enabled, email: computed(() => saved.email), lastSyncedAt: computed(() => saved.lastSyncedAt),
        waiting, syncing, signingIn, needsSignIn, problem,
        prepareSignIn, signIn, signOut, queueSolves, queueDeletion,
    }
});
