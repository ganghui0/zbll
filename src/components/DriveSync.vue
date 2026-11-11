<script setup>
import {computed, onMounted} from "vue";
import {useI18n} from 'vue-i18n'
import {SyncProblem, useDriveSyncStore} from "@/stores/DriveSyncStore";

const {t} = useI18n()
const driveSync = useDriveSyncStore()

onMounted(() => {
  if (!driveSync.enabled) {
    driveSync.prepareSignIn() // Google's script, for the click on "sign in"
  }
})

const onSignInClicked = async () => {
  const failure = await driveSync.signIn()
  if (failure === "popup_failed_to_open") {
    alert(t("drive_sync.sign_in_blocked"))
  } else if (failure === "no_scope") {
    alert(t("drive_sync.sign_in_no_drive"))
  } else if (failure && failure !== "popup_closed" && failure !== "access_denied") { // the user said no
    alert(t("drive_sync.sign_in_failed") + "\n" + failure)
  }
}

const lastSynced = computed(() => driveSync.lastSyncedAt
    ? t("drive_sync.last_synced", {time: new Date(driveSync.lastSyncedAt).toLocaleString()})
    : t("drive_sync.not_synced_yet"))

// what holds the sync up, if anything
const trouble = computed(() => {
  if (driveSync.needsSignIn) {
    return t("drive_sync.sign_in_again_hint")
  }
  return {
    [SyncProblem.OFFLINE]: t("drive_sync.problem_offline"),
    [SyncProblem.DRIVE]: t("drive_sync.problem_drive"),
    [SyncProblem.FILE]: t("drive_sync.problem_file"),
    [SyncProblem.STORAGE]: t("drive_sync.problem_storage"),
  }[driveSync.problem] ?? ""
})
</script>

<template>
  <div>
    <div class="h5 mb-2">{{ $t("drive_sync.title") }}</div>
    <div v-if="!driveSync.configured" class="text-muted">{{ $t("drive_sync.not_configured") }}</div>
    <template v-else>
      <div class="mb-2">
        <button
            v-if="!driveSync.enabled || driveSync.needsSignIn"
            type="button" class="me-2 btn btn-primary"
            tabindex="-1" @keydown.space.prevent=""
            :disabled="driveSync.signingIn"
            @click="onSignInClicked">
          {{ $t(driveSync.enabled ? "drive_sync.sign_in_again" : "drive_sync.sign_in") }}
        </button>
        <button
            v-if="driveSync.enabled"
            type="button" class="me-2 btn btn-outline-secondary"
            tabindex="-1" @keydown.space.prevent=""
            @click="driveSync.signOut()">
          {{ $t("drive_sync.sign_out") }}
        </button>
      </div>
      <div role="status">
        <template v-if="driveSync.enabled">
          <div>
            {{ driveSync.email ? $t("drive_sync.signed_in_as", {email: driveSync.email}) : $t("drive_sync.signed_in") }}
          </div>
          <div>
            {{ lastSynced }} · {{ $t("drive_sync.n_waiting", driveSync.waiting) }}
            <span v-if="driveSync.syncing"> · {{ $t("drive_sync.syncing") }}</span>
          </div>
          <div v-if="trouble" class="text-warning">{{ trouble }}</div>
        </template>
        <div v-else class="text-muted">{{ $t("drive_sync.signed_out") }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
</style>
