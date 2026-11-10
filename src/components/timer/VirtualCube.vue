<script setup>
import {onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useSmartCubeStore} from "@/stores/SmartCubeStore";
import {defaultSettings, useSettingsStore} from "@/stores/SettingsStore";
import {VirtualCubeView} from "@/helpers/virtual_cube_view";

const smartCube = useSmartCubeStore()
const settings = useSettingsStore()
const canvas = ref(null)
let view = null
let resizeObserver = null

onMounted(() => {
  try {
    view = new VirtualCubeView(canvas.value)
  } catch (e) {
    console.error("[smart cube] cannot draw the virtual cube", e)
    return
  }
  if (import.meta.env.DEV) {
    canvas.value.virtualCubeView = view // for debugging in the browser console
  }
  view.setView(settings.store.smartCubeViewYaw, settings.store.smartCubeViewPitch)
  view.setState(smartCube.cubeDrawing.state)
  view.setOrientation(smartCube.cubeOrientation.quat, true)
  resizeObserver = new ResizeObserver(() => view.resize())
  resizeObserver.observe(canvas.value)
})

onBeforeUnmount(() => {
  stopDragging()
  resizeObserver?.disconnect()
  view?.dispose()
  view = null
})

// sync: every turn is drawn, also when several arrive at once
watch(() => smartCube.cubeDrawing, ({state, move}) => {
  if (move) {
    view?.addMove(move, state)
  } else {
    view?.setState(state)
  }
}, {flush: "sync"})
watch(() => smartCube.cubeOrientation, ({quat, jump}) => view?.setOrientation(quat, jump), {flush: "sync"})
watch(() => [settings.store.smartCubeViewYaw, settings.store.smartCubeViewPitch],
    ([yaw, pitch]) => view?.setView(yaw, pitch))

// Drag with the mouse to look at the cube from another side. Double click to undo, and to show the cube
// upright, for when the drawing has drifted away from how the real cube is held.
const DEGREES_PER_PIXEL = 0.5
let dragFrom = null
const onDrag = event => {
  const yaw = settings.store.smartCubeViewYaw + (event.clientX - dragFrom.x) * DEGREES_PER_PIXEL
  const pitch = settings.store.smartCubeViewPitch + (event.clientY - dragFrom.y) * DEGREES_PER_PIXEL
  dragFrom = {x: event.clientX, y: event.clientY}
  settings.store.smartCubeViewYaw = ((yaw + 180) % 360 + 360) % 360 - 180
  settings.store.smartCubeViewPitch = Math.max(-90, Math.min(90, pitch))
}
const stopDragging = () => {
  dragFrom = null
  window.removeEventListener("mousemove", onDrag)
  window.removeEventListener("mouseup", stopDragging)
}
const startDragging = event => {
  dragFrom = {x: event.clientX, y: event.clientY}
  window.addEventListener("mousemove", onDrag)
  window.addEventListener("mouseup", stopDragging)
  event.preventDefault() // no text selection
}
const resetView = () => {
  settings.store.smartCubeViewYaw = defaultSettings.smartCubeViewYaw
  settings.store.smartCubeViewPitch = defaultSettings.smartCubeViewPitch
  smartCube.recenter() // and the real cube is held upright right now
}
</script>

<template>
  <canvas ref="canvas" class="virtual_cube" @mousedown="startDragging" @dblclick="resetView"></canvas>
</template>

<style scoped>
.virtual_cube {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}
</style>
