<script setup>
import LangDropdown from "@/components/nav/LangDropdown.vue";
import ThemeSwitcher from "@/components/nav/ThemeSwitcher.vue";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useDisplayStore} from "@/stores/DisplayStore";
import {useRouter, useRoute} from "vue-router";
import {computed} from "vue";
import {useSessionStore} from "@/stores/SessionStore";
import {ConnectionStatus, useSmartCubeStore} from "@/stores/SmartCubeStore";
import {useI18n} from 'vue-i18n'

const {t} = useI18n()
const selected = useSelectedStore();
const session = useSessionStore()
const smartCube = useSmartCubeStore()
const router = useRouter();
const route = useRoute()
const displayStore = useDisplayStore()

const isTimerView = computed(() => route.fullPath.endsWith("timer"))
const settingsBtnClass = computed(() => displayStore.showSettings ? 'bg-info text-white' : 'text-info')
const tinySelectBtnText = computed(() => {
  return isTimerView && session.store.recapMode
      ? (session.casesWithZeroCount.length + '/' + selected.totalZbllsSelected())
      : selected.totalZbllsSelected()
})

const smartCubeBtnClass = computed(() => smartCube.connected ? 'bg-success text-white' : 'text-info')
// No title: the browser kept showing its tooltip after its device chooser had closed.
const smartCubeBtnLabel = computed(() => t(smartCube.connected ? "smart_cube.disconnect" : "smart_cube.connect"))
const onSmartCubeBtnClicked = async () => {
  if (!smartCube.supported) {
    alert(t("smart_cube.not_supported"))
    return
  }
  if (smartCube.connected) {
    smartCube.disconnect()
    return
  }
  try {
    await smartCube.connect(deviceName => prompt(t("smart_cube.mac_prompt", {name: deviceName})))
  } catch (e) {
    if (e?.name !== "NotFoundError") { // NotFoundError: the device chooser was closed without choosing
      console.error(e)
      alert(t("smart_cube.connect_failed") + "\n" + (e?.message ?? e))
    }
  }
}
</script>

<template>
  <nav class="navbar bg-secondary bg-opacity-25 py-lg-3 py-sm-1 py-0">
    <div class="row w-100 align-items-center">
      <div class="col-auto me-auto">
        <button
            v-if="isTimerView"
            tabindex="-1"
            @keydown.space.prevent=""
            @click="router.push('select')"
            class="mx-2 btn btn-primary">
          <span class="d-none d-sm-inline-block">{{ $t("nav.select_btn") }}</span>
          <i class="bi bi-card-checklist d-inline-block d-sm-none">
            {{ ` ${tinySelectBtnText}` }}
          </i>
        </button>
        <button
            v-if="isTimerView"
            @click="displayStore.showStatistics = !displayStore.showStatistics"
            :class="displayStore.showStatistics ? 'btn-primary' : 'btn-outline-primary'"
            class="mx-2 btn d-inline-block d-sm-none m-0">
          <i class="bi bi-list-columns"></i>
        </button>
        <span v-else class="mx-3 logoText">
          {{ $t("nav.zbll_trainer") }}
        </span>
        <span class="mx-2 d-none d-sm-inline-block">
          {{ $t("nav.n_cases", selected.totalZbllsSelected()) }}
        </span>
        <span class="mx-2 d-none d-sm-inline-block" v-if="isTimerView && session.store.recapMode">
          {{ $t("nav.n_to_recap", session.casesWithZeroCount.length) }}
        </span>
      </div>
      <div class="col d-flex justify-content-end p-0">
        <LangDropdown/>
        <button
            v-if="isTimerView"
            class="btn btn-link px-1 px-md-3"
            tabindex="-1" @keydown.space.prevent=""
            :class="smartCubeBtnClass"
            :disabled="smartCube.status === ConnectionStatus.CONNECTING"
            @click="onSmartCubeBtnClicked"
            :aria-label="smartCubeBtnLabel">
          <i class="bi-bluetooth font_bigger"/>
        </button>
        <button
            class="btn btn-link px-1 px-md-3"
            tabindex="-1" @keydown.space.prevent=""
            :class="settingsBtnClass"
            @click="displayStore.showSettings = !displayStore.showSettings"
            :title="$t('nav.settings')">
          <i class="bi-wrench font_bigger"/>
        </button>
        <ThemeSwitcher/>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.logoText {
  font-weight: 900;
}
</style>