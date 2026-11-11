<script setup>
import {computed, ref, watch} from "vue";
import {TimerState, useSessionStore} from "@/stores/SessionStore";
import {msToHumanReadable, resultToHumanReadable} from "@/helpers/time_formatter";
import {
  formatTps, hasSolveStats, summarizeSolves, toMoves, turnsBeforeExecution, turnsPerSecond,
} from "@/helpers/solve_stats";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {useCaseHistoryStore} from "@/stores/CaseHistoryStore";
import {WeakCases} from "@/helpers/case_weights";
import {formatZbllKey} from "@/helpers/helpers";
import {usePresetsStore, starredName} from "@/stores/PresetStore";
import { useI18n } from 'vue-i18n'
import CubePicture from "@/components/timer/CubePicture.vue";
import SetupAndAlgs from "@/components/timer/SetupAndAlgs.vue";
import ZbllNote from "@/components/ZbllNote.vue";
import SolveStatsTable from "@/components/timer/SolveStatsTable.vue";
const { t } = useI18n()

const sessionStore = useSessionStore()
const selectedStore = useSelectedStore()
const settings = useSettingsStore()
const presets = usePresetsStore()
const caseHistory = useCaseHistoryStore()
const isValid = computed(() => sessionStore.stats().length > sessionStore.observingResult)
const result = computed(() => {
      return isValid.value
          ? sessionStore.stats()[sessionStore.observingResult]
          : {"i": 0, key: "", "scramble": "", "ms": 0}
    }
)

// What the smart cube told about the solve, next to the mean of the solves of the same case in the session
const caseSolves = computed(() => summarizeSolves(sessionStore.stats().filter(other => other.key === result.value.key)))
const withCaseMean = computed(() => caseSolves.value.count > 1)
const solveStatsColumns = computed(() => withCaseMean.value
    ? [t("solve_stats.this_solve"), t("solve_stats.case_mean", caseSolves.value.count)]
    : [])
const solveStatsRows = computed(() => {
  const solve = result.value
  const time = ms => ms == null ? "–" : msToHumanReadable(ms, settings.store.timerPrecision)
  const moves = count => count == null ? "–" : Number.isInteger(count) ? `${count}` : count.toFixed(1)
  const row = (name, format, value, hint) => ({
    label: t("solve_stats." + name),
    hint,
    cells: [format(value), ...(withCaseMean.value ? [format(caseSolves.value[name]?.mean)] : [])],
  })
  return [
    ...(solve.recognitionMs == null ? [] : [row("recognition", time, solve.recognitionMs)]),
    row("execution", time, solve.executionMs),
    row("moves", moves, solve.moveCount, t("solve_stats.moves_hint")),
    row("tps", formatTps, turnsPerSecond(solve)),
  ]
})
// the turns that were made, the ones before the execution apart
const turns = computed(() => {
  const all = result.value.turns.split(" ")
  const before = turnsBeforeExecution(result.value)
  return {
    recognition: toMoves(all.slice(0, before)).join(" "),
    execution: toMoves(all.slice(before)).join(" "),
  }
})

// What makes the case come up more or less often than the others, see case_weights.js: its latest results,
// and how often that is if it is among the cases that are trained.
const recentResults = computed(() => settings.store.weakCases === WeakCases.OFF ? []
    : caseHistory.resultsOf(result.value.key).map(recent => resultToHumanReadable(recent, settings.store.timerPrecision)))
const comesUp = computed(() => sessionStore.comesUp?.get(result.value.key)?.toFixed(1) ?? null)

const onDeleteBtnClicked = () => {
  if (isValid.value && confirm(t("result_card.are_you_sure_to_delete"))) {
    sessionStore.deleteResult(sessionStore.observingResult)
  }
}

const isSelected = computed(() => selectedStore.isZbllSelected(result.value["key"]))
const isSelectedCheckboxValue = ref(isSelected.value);
watch(isSelectedCheckboxValue, (doSelect) => {
  if (isValid.value && doSelect !== isSelected.value) {
    const action = doSelect ? selectedStore.addZbll : selectedStore.removeZbll;
    action(result.value["key"]);
  }
})
watch(isSelected, () => isSelectedCheckboxValue.value = isSelected.value)

const isBookmarked = computed(() => presets.hasCase(starredName, result.value.key))
const bookmarkIconClass = computed(() => isBookmarked.value ? "bi-star-fill text-info" : "bi-star text-primary")
const starClicked = () => {
  if (isValid.value && sessionStore.timerState === TimerState.NOT_RUNNING) {
    const action = isBookmarked.value ? presets.removeFromPreset : presets.addToPreset
    action(starredName, result.value.key)
  }
}

</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="mb-0">
        <div class="row align-items-center">
          <div class="col">
            <span class="d-sm-inline-block d-none">{{$t("result_card.result_no", result["i"] + 1)}} &nbsp;</span>
            <span class="badge bg-primary">{{ resultToHumanReadable(result, settings.store.timerPrecision) }}</span>
          </div>
          <div class="col-auto">
            <button
                tabindex="-1" @keydown.space.prevent=""
                class="btn btn-sm btn-outline-danger mx-1"
                :title="$t('result_card.delete_btn')"
                :disabled="sessionStore.timerState !== TimerState.NOT_RUNNING"
                @click="onDeleteBtnClicked">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </h5>
      <hr class="my-2 my-sm-3">
      <template v-if="hasSolveStats(result)">
        <SolveStatsTable :columns="solveStatsColumns" :rows="solveStatsRows"/>
        <p class="card-text small my-1" :title="$t('solve_stats.turns_hint')">
          <span class="opacity-75">{{ $t("solve_stats.turns") }}</span>
          <span v-if="turns.recognition" class="opacity-75"> ({{ turns.recognition }})</span>
          {{ turns.execution }}
        </p>
        <hr class="my-2 my-sm-3">
      </template>
      <p class="card-text my-0 my-sm-1">
        <span class="d-sm-inline-block d-none">{{$t("result_card.case")}}</span>
        {{ formatZbllKey(result["key"]) }}
        <i
            class="bi clickable px-1"
            :title="$t('result_card.add_to_starred') + ' (Alt+A)'"
            :class="bookmarkIconClass"
            @click="starClicked"/>
      </p>
      <p v-if="recentResults.length > 0" class="card-text small my-0 my-sm-1" :title="$t('result_card.recent_results_hint')">
        <span class="opacity-75">{{ $t("result_card.recent_results") }}</span>
        {{ recentResults.join(", ") }}
        <span v-if="comesUp !== null" class="opacity-75">· {{ $t("result_card.comes_up", {times: comesUp}) }}</span>
      </p>
      <ZbllNote :zbllKey="result['key']"/>
      <div class="form-check mt-1">
        <label
            class="form-check-label"
            :title="$t('result_card.selected_title') + ' (Alt+S)'"
            for="flexCheckDefault">
          <input
              tabindex="-1" @keydown.space.prevent=""
              class="form-check-input styled"
              type="checkbox"
              id="flexCheckDefault"
              :disabled="sessionStore.timerState !== TimerState.NOT_RUNNING"
              v-model="isSelectedCheckboxValue">
          {{$t("result_card.selected")}}
        </label>
      </div>
      <CubePicture :scramble="result['scramble']"/>
      <p class="card-text my-0 my-sm-1">
        <SetupAndAlgs :zbllKey="result['key']" :maxAmount="3" :scramble="result['scramble']"/>
      </p>
      <p class="d-sm-block d-none card-text my-0 my-sm-1">
        <span class="">{{$t("result_card.scramble")}}&nbsp;</span>
        {{ result["scramble"] }}
      </p>
    </div>
  </div>
</template>

<style scoped>
</style>