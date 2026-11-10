<script setup>
import {computed, defineAsyncComponent} from "vue";
import {Phase, useSmartCubeStore} from "@/stores/SmartCubeStore";
import {useSessionStore} from "@/stores/SessionStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {useI18n} from 'vue-i18n'

// the 3D drawing is only loaded once a cube is connected
const VirtualCube = defineAsyncComponent(() => import("@/components/timer/VirtualCube.vue"))

const {t} = useI18n()
const smartCube = useSmartCubeStore()
const session = useSessionStore()
const settings = useSettingsStore()

const hint = computed(() => {
  if (smartCube.caseActive) {
    return ""
  }
  if (!session.currentScramble) {
    return t("timer.no_scramble")
  }
  if (smartCube.phase === Phase.PENDING) {
    return t("smart_cube.next_case")
  }
  return t(settings.store.smartCubeGestures ? "smart_cube.press_or_turn_to_start" : "smart_cube.press_to_start")
})
</script>

<template>
  <div class="w-100 noselect">
    <div class="cube_box">
      <VirtualCube/>
    </div>
    <!-- always there, so that nothing jumps when the hint comes and goes -->
    <div class="hint px-2 text-center fs-5 opacity-75">{{ hint }}</div>
  </div>
</template>

<style scoped>
.cube_box {
  width: min(340px, 100%);
  aspect-ratio: 1;
  margin: 0 auto;
}
.hint {
  min-height: 2em;
}
</style>
