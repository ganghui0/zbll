<script setup>
import {TimerState, useSessionStore} from "@/stores/SessionStore";
import {computed, onMounted, ref, watch} from "vue";
import {msToHumanReadable, resultToHumanReadable} from "@/helpers/time_formatter";
import {formatTps, leastFluentAufs, summarizeAufs, summarizeSolves} from "@/helpers/solve_stats";
import SolveStatsTable from "@/components/timer/SolveStatsTable.vue";
import {useSettingsStore} from "@/stores/SettingsStore";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useCaseHistoryStore} from "@/stores/CaseHistoryStore";
import {formatZbllKey} from "@/helpers/helpers";
import {useSmartCubeStore} from "@/stores/SmartCubeStore";
import CaseInfoModal from "@/components/timer/CaseInfoModal.vue";
import {useI18n} from 'vue-i18n'
const {t} = useI18n()

const sessionStore = useSessionStore()
const settings = useSettingsStore()
const numResults = computed(() => sessionStore.stats().length)
const onClearBtnClick = () => {
  if (confirm(t("stats_card.are_you_sure_to_clean"))) {
    sessionStore.clearSession()
  }
}

const statsContainer = ref(null);
const scrollStats = () => statsContainer.value && (statsContainer.value.scrollTop = statsContainer.value.scrollHeight)
const scrollStatsLater = () => setTimeout(() => scrollStats(), 10)
onMounted(() => {
  watch(numResults, scrollStatsLater);
  scrollStatsLater()
})

const statClicked = i => sessionStore.observingResult = i

// The cases that come up most often because of their results, see case_weights.js. A case that has not
// come up yet is not known to be weak.
const WEAKEST_SHOWN = 5
const caseHistory = useCaseHistoryStore()
const weakestCases = computed(() => [...(sessionStore.comesUp ?? [])]
    .filter(([key, times]) => times > 1 && caseHistory.resultsOf(key).length > 0)
    .sort(([, times], [, otherTimes]) => otherTimes - times)
    .slice(0, WEAKEST_SHOWN)
    .map(([key, times]) => ({key, name: formatZbllKey(key), times: times.toFixed(1)})))

// The name of a case does not tell what it looks like: a click on it shows the case.
const shownCase = ref(null)
// a smart cube starts the training by itself: the case does not stay over the timer
const smartCube = useSmartCubeStore()
watch(() => smartCube.training, training => training && (shownCase.value = null))

// of the solves that a smart cube told more about than their time
const smartCubeSolves = computed(() => summarizeSolves(sessionStore.stats()))
const smartCubeRows = computed(() => {
  const time = ms => msToHumanReadable(ms, settings.store.timerPrecision)
  const row = (name, format, hint) => {
    const {mean, best} = smartCubeSolves.value[name]
    return {label: t("solve_stats." + name), hint, cells: [format(mean), format(best)]}
  }
  // without a recognition time the time of a solve is that of its execution
  const split = smartCubeSolves.value.recognition !== null
  return [
    ...(split ? [row("time", time), row("recognition", time)] : []),
    row("execution", time),
    ...(smartCubeSolves.value.tps === null ? [] : [row("tps", formatTps)]),
    ...(smartCubeSolves.value.auf === null ? [] : [row("auf", time, t("solve_stats.auf_hint"))]),
  ]
})

// Whether the AUF of an alg is known shows in how a solve ends, see solve_stats.js: how many AUFs of the
// session were fluent, and the cases whose latest ones were not.
const LEAST_FLUENT_SHOWN = 5
const aufs = computed(() => summarizeAufs(sessionStore.stats()))
const leastFluentAufCases = computed(() => leastFluentAufs(sessionStore.stats())
    .slice(0, LEAST_FLUENT_SHOWN)
    .map(({key, count, fluent}) => ({key, name: formatZbllKey(key), count, fluent})))

</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="mb-0">
        <div class="row align-items-center">
          <div class="col">
            {{t("stats_card.stats_title")}} {{ t("stats_card.n_solves", numResults) }}
          </div>
          <div class="col-auto">
            <button
                class="btn btn-sm btn-outline-danger mx-1"
                tabindex="-1" @keydown.space.prevent=""
                @click="onClearBtnClick"
                :title="t('stats_card.clear_btn_hint') + ' (Shift+Delete)'"
                v-if="sessionStore.stats().length > 0">
              {{t("stats_card.clear_btn")}}
            </button>
          </div>
        </div>
      </h5>
      <hr>
      <div class="stats-container" ref="statsContainer">
        <span v-for="(stat, index) in sessionStore.stats()" :key="index">
          <span
              @click="statClicked(stat['i'])" class="clickable stat"
              :class="sessionStore.observingResult === stat['i'] ? 'text-info' : ''">
            {{ resultToHumanReadable(stat, settings.store.timerPrecision) }}
          </span>{{ stat["i"] === sessionStore.stats().length - 1 ? "" : ", " }}
        </span>
        <div v-if="sessionStore.stats().length === 0 && sessionStore.timerState !== TimerState.RUNNING">
          {{t("stats_card.hold_spacebar_hint")}}
        </div>
      </div>
      <template v-if="weakestCases.length > 0">
        <hr>
        <div class="small" :title="t('stats_card.weakest_cases_hint')">
          <span class="opacity-75 me-1">{{ t("stats_card.weakest_cases") }}</span>
          <span v-for="(weak, index) in weakestCases" :key="weak.key">
            <span class="clickable stat" @click="shownCase = weak.key">
              <span class="case_name">{{ weak.name }}</span> <span class="opacity-75">×{{ weak.times }}</span>
            </span>{{ index < weakestCases.length - 1 ? ", " : "" }}
          </span>
        </div>
      </template>
      <template v-if="smartCubeSolves.count > 0">
        <hr>
        <div class="mb-1">{{ t("solve_stats.smart_cube_solves", smartCubeSolves.count) }}</div>
        <SolveStatsTable :columns="[t('solve_stats.mean'), t('solve_stats.best')]" :rows="smartCubeRows"/>
        <div v-if="aufs.count > 0" class="small mt-2" :title="t('solve_stats.auf_session_hint')">
          <span class="opacity-75 me-1">{{ t("solve_stats.auf_label") }}</span>
          <span class="me-1">{{ t("solve_stats.auf_n_fluent", aufs) }}</span>
          <template v-if="leastFluentAufCases.length > 0">
            <span class="opacity-75 me-1">· {{ t("solve_stats.auf_least_fluent") }}</span>
            <span v-for="(unsure, index) in leastFluentAufCases" :key="unsure.key">
              <span class="clickable stat" @click="shownCase = unsure.key">
                <span class="case_name">{{ unsure.name }}</span> <span class="opacity-75">{{ unsure.fluent }}/{{ unsure.count }}</span>
              </span>{{ index < leastFluentAufCases.length - 1 ? ", " : "" }}
            </span>
          </template>
        </div>
      </template>
      <CaseInfoModal v-if="shownCase" :key="shownCase" :zbllKey="shownCase" @closed="shownCase = null"/>
    </div>
  </div>
</template>

<style scoped>
.stat {
  transition: color 0.1s;
}

.stat:hover {
  color: var(--bs-info)
}
/* tells that there is more behind the name, also where nothing hovers */
.case_name {
  text-decoration: underline dotted;
  text-underline-offset: 0.2em;
}
.stats-container {
  max-height: 200px;
  overflow-y: auto;
}
</style>