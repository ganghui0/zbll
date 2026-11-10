<script setup>

import {useSessionStore} from "@/stores/SessionStore";
import {computed} from "vue";
import {useSettingsStore} from "@/stores/SettingsStore";
import {ConnectionStatus, useSmartCubeStore} from "@/stores/SmartCubeStore";
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const session = useSessionStore()
const settings = useSettingsStore()
const smartCube = useSmartCubeStore()
const scramble = computed(() => session.currentScramble ?? t("timer.no_scramble"))
const appendix = computed(() => settings.store.scrambleAppendix === "None" ? "" : " " + settings.store.scrambleAppendix)

</script>

<template>
  <h3 class="border-bottom border-secondary m-1">
    <!-- with a smart cube the case is drawn on screen and the cube is not scrambled -->
    <span v-if="smartCube.connected" :style="{ fontSize: settings.store.scrambleFontSize + 'px' }">
      <i class="bi bi-bluetooth opacity-50"></i>
      {{ smartCube.deviceName }}
      <span v-if="smartCube.battery !== null" class="opacity-75">
        · <i class="bi bi-battery-half"></i> {{ smartCube.battery }}%
      </span>
    </span>
    <span
        v-else-if="smartCube.status === ConnectionStatus.CONNECTING"
        class="opacity-75"
        :style="{ fontSize: settings.store.scrambleFontSize + 'px' }">
      <i class="bi bi-bluetooth"></i>
      {{ smartCube.statusMessage }}
    </span>
    <template v-else>
      <span class="opacity-50 d-none d-sm-inline-block">{{$t("timer.scramble") + '&nbsp;'}} </span>
      <span :style="{ fontSize: settings.store.scrambleFontSize + 'px' }">
        {{ scramble }}
        <span class="opacity-75">{{appendix}}</span>
      </span>
    </template>
  </h3>
</template>

<style scoped>
</style>
