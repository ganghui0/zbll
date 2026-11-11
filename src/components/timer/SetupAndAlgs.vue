<script setup>
import zbll_map_next from "@/assets/zbll_map_next.json"
import {computed} from "vue";
import {setupMoves} from "@/helpers/scramble_utils";
import {fromSide, sideOfCase} from "@/helpers/alg_turns";
// scramble: the one that the picture next to the algs is drawn from, if it is
const props = defineProps(['zbllKey', 'maxAmount', 'scramble']);

// The algs are written for the case as it is drawn in the list of cases. A scramble shows the case from any
// side: next to its picture the algs, and the setup with them, are for that side.
const algs = computed(() => {
  const written = zbll_map_next[props.zbllKey].algs
  if (!props.scramble) {
    return written
  }
  const side = sideOfCase(props.scramble, written)
  return written.map(alg => fromSide(alg, side))
})
const suggestedAlgs = computed(() => algs.value.slice(0, props.maxAmount))
const setup = computed(() => setupMoves(algs.value))

</script>

<template>
  <div>{{ $t("result_card.setup_moves") }}: <strong>{{setup}}</strong></div>
  <div class="mt-2">{{ $t("result_card.algorithms_collection") }}:</div>
  <div>
    <ul>
      <li
          v-for="(alg, i) in suggestedAlgs"
          :key="alg"
          :class="i === 0 ? 'fw-bold' : ''"
      >
        {{alg}}
      </li>
    </ul>
  </div>

</template>

<style scoped>
ul {
  list-style-type: none;
  padding-left: 0;
}
ul li::before {
  content: "·";
  margin-right: 4px;
}
</style>