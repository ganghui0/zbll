// Weak cases come up more often (see the settings): a case is chosen with a chance in proportion to its
// weight, which comes from its latest results, see CaseHistoryStore.
//
// A result is measured in typical times. The typical time is the median, over the cases to choose from, of
// the mean time of their latest solves. A DNF counts as DNF_SCORE typical times, and so does a solve that
// took even longer: one solve that went all wrong does not tell more than a DNF.
// A solve that ended with an AUF that was not fluent (see solve_stats.js) counts as a slower one, by
// AUF_SCORES typical times: the AUF of the alg is not known, and the time of the solve shows little of that.
// The score of a case is the mean of its latest results and of one more, NEW_CASE_SCORE, that stands for
// what is not known: a case without results is taken for a rather weak one, and one lucky solve does not
// make a case a strong one. 1 is a typical case, 1.5 one that takes half as long again.
// The weight is the score to a power that says how much weak cases are favoured, and not less than a
// minimum: every case keeps coming up.

import {median} from "@/helpers/helpers";
import {Auf} from "@/helpers/solve_stats";

export const WeakCases = Object.freeze({
  OFF: "off", // all cases alike
  MORE: "more",
  MOST: "most",
})

const FOCUS = {
  [WeakCases.MORE]: {exponent: 2, minWeight: 0.5},
  [WeakCases.MOST]: {exponent: 4, minWeight: 0.25},
}
const DNF_SCORE = 2
// a pause can also be a regrip, a correction is hardly anything but an AUF that was not known
const AUF_SCORES = {[Auf.PAUSED]: 0.25, [Auf.CORRECTED]: 0.5}
const NEW_CASE_SCORE = 1.5

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length

// resultsOf(key): the latest results of a case, [{ms, dnf, auf}] as in CaseHistoryStore
// Returns the typical time in ms, or null if none of the cases has been solved.
export const typicalTime = (keys, resultsOf) => {
  const means = keys
      .map(key => resultsOf(key).filter(result => !result.dnf).map(result => result.ms))
      .filter(times => times.length > 0)
      .map(mean)
  return means.length === 0 ? null : median(means)
}

const resultScore = (result, typicalMs) => result.dnf ? DNF_SCORE
    : Math.min((typicalMs > 0 ? result.ms / typicalMs : 1) + (AUF_SCORES[result.auf] ?? 0), DNF_SCORE)

// typicalMs: see typicalTime
export const caseScore = (results, typicalMs) =>
    mean([...results.map(result => resultScore(result, typicalMs)), NEW_CASE_SCORE])

// weakCases: WeakCases.MORE or MOST. Returns a Map of every key to its weight.
export const caseWeights = (keys, resultsOf, weakCases) => {
  const {exponent, minWeight} = FOCUS[weakCases]
  const typicalMs = typicalTime(keys, resultsOf)
  return new Map(keys.map(key => [key, Math.max(minWeight, caseScore(resultsOf(key), typicalMs) ** exponent)]))
}

// How often each case comes up compared to the average of them: a Map of every key to 2 for twice as often.
export const caseFrequencies = (keys, resultsOf, weakCases) => {
  const weights = caseWeights(keys, resultsOf, weakCases)
  const average = mean([...weights.values()])
  return new Map([...weights].map(([key, weight]) => [key, weight / average]))
}

// weights: a Map of keys to their weights, not empty. random: from 0 up to 1.
// Returns one of the keys, each with a chance in proportion to its weight.
export const pickWeighted = (weights, random = Math.random()) => {
  let left = random * [...weights.values()].reduce((sum, weight) => sum + weight, 0)
  let picked
  for (const [key, weight] of weights) {
    picked = key
    left -= weight
    if (left < 0) {
      break
    }
  }
  return picked
}
