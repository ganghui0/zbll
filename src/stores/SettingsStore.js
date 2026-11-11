import {reactive, watch} from 'vue'
import {defineStore} from 'pinia'
import {WeakCases} from "@/helpers/case_weights";

export const fontsList = ["Roboto Mono", "Courier New", "Ubuntu Mono", "Arial", "Helvetica",
    "sans-serif", "Times", "serif",]

export const defaultSettings = {
    pictureView: "top",
    timerUpdate: "seconds",
    timerPrecision: 2,
    timerFont: fontsList[0],
    scrambleFontSize: 28,
    timerFontSize: 64,
    showHowTo: true,
    timerStartDelayMs: 100,
    scrambleAppendix: "None",
    // how much more often than the others the cases come up that are solved slowly or not at all, a WeakCases
    weakCases: WeakCases.MORE,
    // smart cube: time from the moment the case appears instead of from the first turn
    smartCubeTimeRecognition: false,
    // smart cube: turning the top face all the way around (U four times) starts the training like the
    // space bar, turning the bottom face all the way around (D' four times) stops it like the escape key
    smartCubeGestures: true,
    // smart cube: the color of the face that is held at the bottom, see CROSS_COLORS
    smartCubeCrossColor: "white",
    // smart cube: the angle the virtual cube is looked at from, in degrees
    smartCubeViewYaw: -25,
    smartCubeViewPitch: 30,
}

const localStorageKey = "zbllTrainerSettings"

export const useSettingsStore = defineStore('settings', () => {
    // saved settings may predate newer options, which then take their defaults
    const store = reactive(
        {...defaultSettings, ...JSON.parse(localStorage.getItem(localStorageKey))}
    )

    const resetDefaults = () => {
        for (let key in defaultSettings) {
            store[key] = defaultSettings[key]
        }
    }

    watch(() => store, () => {
        localStorage.setItem(localStorageKey, JSON.stringify(store))
    }, {deep: true})

    return { resetDefaults, store }
});