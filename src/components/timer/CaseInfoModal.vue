<script setup>
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {Modal} from "bootstrap";
import {useSessionStore} from "@/stores/SessionStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {getZbllImg} from "@/helpers/cube_images";
import {formatZbllKey} from "@/helpers/helpers";
import {msToHumanReadable} from "@/helpers/time_formatter";
import {formatTps, latestAufs, summarizeSolves} from "@/helpers/solve_stats";
import SetupAndAlgs from "@/components/timer/SetupAndAlgs.vue";
import SolveStatsTable from "@/components/timer/SolveStatsTable.vue";
import RecentResults from "@/components/timer/RecentResults.vue";
import ZbllNote from "@/components/ZbllNote.vue";
import {useI18n} from "vue-i18n";

// What there is to know about a case that is only named somewhere: its pictures, as in the list of cases,
// the algs for them, its note and its results. Shown as soon as it is mounted, tells when it was closed.
const props = defineProps(['zbllKey'])
const emit = defineEmits(['closed'])
const {t} = useI18n()

const sessionStore = useSessionStore()
const settings = useSettingsStore()

// the view of the pictures everywhere else first
const pictureViews = computed(() => settings.store.pictureView === "top" ? ["top", "3D"] : ["3D", "top"])

// the results of the case in the session
const results = computed(() => sessionStore.stats().filter(result => result.key === props.zbllKey))
const times = computed(() => results.value.filter(result => !result.dnf).map(result => result.ms))
const dnfCount = computed(() => results.value.length - times.value.length)
const sessionRows = computed(() => {
  const time = ms => msToHumanReadable(ms, settings.store.timerPrecision)
  const moves = count => Number.isInteger(count) ? `${count}` : count.toFixed(1)
  const row = (name, format, {mean, best}, hint) =>
      ({label: t("solve_stats." + name), hint, cells: [format(mean), format(best)]})
  const solved = times.value
  // only the solves with a smart cube tell more than their time
  const smartCube = summarizeSolves(results.value)
  return [
    ...(solved.length === 0 ? [] : [row("time", time, {
      mean: solved.reduce((sum, ms) => sum + ms, 0) / solved.length,
      best: Math.min(...solved),
    })]),
    ...(smartCube.recognition === null ? [] : [row("recognition", time, smartCube.recognition)]),
    ...(smartCube.execution === null ? [] : [row("execution", time, smartCube.execution)]),
    ...(smartCube.moves === null ? [] : [row("moves", moves, smartCube.moves, t("solve_stats.moves_hint"))]),
    ...(smartCube.tps === null ? [] : [row("tps", formatTps, smartCube.tps)]),
    ...(smartCube.auf === null ? [] : [row("auf", time, smartCube.auf, t("solve_stats.auf_hint"))]),
  ]
})
// how fluent its latest AUFs were, which tells whether the AUF of its alg is known, see solve_stats.js
const aufs = computed(() => latestAufs(results.value))

const modalElement = ref(null)
let modal = null
onMounted(() => {
  modal = new Modal(modalElement.value)
  modalElement.value.addEventListener('hidden.bs.modal', () => emit('closed'))
  modal.show()
})
// taken away while it is open: its backdrop goes with it
onBeforeUnmount(() => {
  modal.hide()
  modal.dispose()
})
</script>

<template>
  <Teleport to="body">
    <!-- the keys are the timer's on the page behind: none of them gets there -->
    <div class="modal" ref="modalElement" tabindex="-1" @keydown.stop @keyup.stop>
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ formatZbllKey(zbllKey) }}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-auto">
                <img
                    v-for="view in pictureViews" :key="view"
                    class="case_picture d-block mb-2"
                    :src="getZbllImg(zbllKey, view)" :alt="formatZbllKey(zbllKey)">
              </div>
              <div class="col">
                <ZbllNote :zbllKey="zbllKey"/>
                <SetupAndAlgs :zbllKey="zbllKey" :maxAmount="8"/>
              </div>
            </div>
            <hr class="mt-0">
            <RecentResults :zbllKey="zbllKey" class="mb-2"/>
            <div class="mb-1">
              {{ t("case_info.session_solves", times.length) }}
              <span v-if="dnfCount > 0">· {{ t("case_info.n_dnf", {count: dnfCount}) }}</span>
            </div>
            <SolveStatsTable
                v-if="sessionRows.length > 0"
                :columns="[t('solve_stats.mean'), t('solve_stats.best')]" :rows="sessionRows"/>
            <p v-if="aufs.count > 0" class="mt-2 mb-0" :title="t('solve_stats.auf_hint')">
              <span class="opacity-75">{{ t("solve_stats.auf_label") }}</span>
              {{ t("solve_stats.auf_n_fluent", aufs) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.case_picture {
  width: 120px;
}
</style>
