<script setup>
import {computed} from "vue";
import {useSessionStore} from "@/stores/SessionStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {useCaseHistoryStore} from "@/stores/CaseHistoryStore";
import {resultToHumanReadable} from "@/helpers/time_formatter";
import {Auf, aufTextClass} from "@/helpers/solve_stats";

// What makes a case come up more or less often than the others, see case_weights.js: its latest results,
// and how often that is if it is among the cases that are trained. A solve that counts as a slower one
// because its AUF was not fluent has the color of that AUF.
const props = defineProps(['zbllKey'])
const sessionStore = useSessionStore()
const settings = useSettingsStore()
const caseHistory = useCaseHistoryStore()

const results = computed(() => caseHistory.resultsOf(props.zbllKey).map(recent => ({
  id: recent.id,
  text: resultToHumanReadable(recent, settings.store.timerPrecision),
  class: recent.auf === Auf.FLUENT ? "" : aufTextClass(recent.auf),
})))
const comesUp = computed(() => sessionStore.comesUp?.get(props.zbllKey)?.toFixed(1) ?? null)
</script>

<template>
  <p v-if="results.length > 0" :title="$t('result_card.recent_results_hint')">
    <span class="opacity-75 me-1">{{ $t("result_card.recent_results") }}</span>
    <template v-for="(recent, i) in results" :key="recent.id">{{ i > 0 ? ", " : "" }}<span :class="recent.class">{{ recent.text }}</span></template>
    <span v-if="comesUp !== null" class="opacity-75"> · {{ $t("result_card.comes_up", {times: comesUp}) }}</span>
  </p>
</template>
