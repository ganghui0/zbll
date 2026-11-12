import {defineStore} from 'pinia'
import {reactive, watch} from "vue";
import {finalAuf} from "@/helpers/solve_stats";

const historyKey = "zbll_case_history"
// How many results of a case are kept. What a case was like a while ago does not tell how weak it is now.
export const HISTORY_SIZE = 5

// The latest results of every case, which tell how weak it is (see case_weights.js). Unlike the stats they
// stay when the session is cleared: how well a case is known does not start over with a session.
export const useCaseHistoryStore = defineStore('caseHistory', () => {
    const saved = JSON.parse(localStorage.getItem(historyKey))
    // {key: [{id, ms, dnf, auf}]}, the latest result last. auf: how the AUF went that ended the solve, an Auf
    // of solve_stats.js. Only a smart cube solve that ended with one has it.
    const history = reactive(saved ?? {})

    // nothing has been kept yet: the results of the session can go in
    const isNew = saved === null

    const resultsOf = key => history[key] ?? []

    // what is kept of a result of the session stats, see SessionStore
    const entryOf = result => {
        const auf = finalAuf(result)?.kind
        return {id: result.id, ms: result.ms, dnf: !!result.dnf, ...(auf ? {auf} : {})}
    }

    const add = result => {
        history[result.key] = [...resultsOf(result.key), entryOf(result)].slice(-HISTORY_SIZE)
    }

    // A result that was kept before its AUF was gets it now: the session has what tells it.
    const addAuf = result => {
        const entry = resultsOf(result.key).find(kept => kept.id === result.id)
        const auf = entry && finalAuf(result)?.kind
        if (auf && entry.auf !== auf) {
            entry.auf = auf
        }
    }

    // the result was deleted: it does not count
    const remove = result => {
        if (resultsOf(result.key).some(entry => entry.id === result.id)) {
            history[result.key] = resultsOf(result.key).filter(entry => entry.id !== result.id)
        }
    }

    watch(history, () => localStorage.setItem(historyKey, JSON.stringify(history)))

    return {isNew, resultsOf, add, addAuf, remove}
});
