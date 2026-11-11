<script setup>
import {computed} from "vue";
import {useSessionStore} from "@/stores/SessionStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {useSmartCubeStore} from "@/stores/SmartCubeStore";
import {msToHumanReadable} from "@/helpers/time_formatter";
import {formatTps, hasSolveStats, turnsPerSecond} from "@/helpers/solve_stats";
import {useI18n} from 'vue-i18n'

// What the smart cube told about the last solve. It stays under the timer while the next case is solved,
// when the cards are out of sight. They have it when the trainer is paused.
const {t} = useI18n()
const session = useSessionStore()
const settings = useSettingsStore()
const smartCube = useSmartCubeStore()

const line = computed(() => {
  const solve = session.stats()[session.stats().length - 1]
  if (!smartCube.training || !hasSolveStats(solve)) {
    return ""
  }
  const time = ms => msToHumanReadable(ms, settings.store.timerPrecision)
  const split = solve.recognitionMs == null ? "" : " = "
      + `${time(solve.recognitionMs)} ${t("solve_stats.recognition_short")} + `
      + `${time(solve.executionMs)} ${t("solve_stats.execution_short")}`
  return [
    t("solve_stats.last", {time: time(solve.ms)}) + split,
    t("solve_stats.n_moves", solve.moveCount),
    `${formatTps(turnsPerSecond(solve))} ${t("solve_stats.tps_unit")}`,
  ].join(" · ")
})
</script>

<template>
  <!-- always there, so that nothing jumps when it comes and goes -->
  <div class="last_solve px-2 text-center fs-5 opacity-75 noselect">{{ line }}</div>
</template>

<style scoped>
.last_solve {
  min-height: 1.5em;
  margin-top: -1rem; /* into the padding of the timer */
  font-variant-numeric: tabular-nums;
}
</style>
