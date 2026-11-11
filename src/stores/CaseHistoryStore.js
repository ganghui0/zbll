import {defineStore} from 'pinia'
import {reactive, watch} from "vue";

const historyKey = "zbll_case_history"
// How many results of a case are kept. What a case was like a while ago does not tell how weak it is now.
export const HISTORY_SIZE = 5

// The latest results of every case, which tell how weak it is (see case_weights.js). Unlike the stats they
// stay when the session is cleared: how well a case is known does not start over with a session.
export const useCaseHistoryStore = defineStore('caseHistory', () => {
    const saved = JSON.parse(localStorage.getItem(historyKey))
    // {key: [{id, ms, dnf}]}, the latest result last
    const history = reactive(saved ?? {})

    // nothing has been kept yet: the results of the session can go in
    const isNew = saved === null

    const resultsOf = key => history[key] ?? []

    // result: of the session stats, see SessionStore
    const add = result => {
        const entry = {id: result.id, ms: result.ms, dnf: !!result.dnf}
        history[result.key] = [...resultsOf(result.key), entry].slice(-HISTORY_SIZE)
    }

    // the result was deleted: it does not count
    const remove = result => {
        if (resultsOf(result.key).some(entry => entry.id === result.id)) {
            history[result.key] = resultsOf(result.key).filter(entry => entry.id !== result.id)
        }
    }

    watch(history, () => localStorage.setItem(historyKey, JSON.stringify(history)))

    return {isNew, resultsOf, add, remove}
});
