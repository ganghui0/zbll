<script setup>
// columns: the headings of the values, none for a table without a head.
// rows: [{label, hint, cells: [text, ...]}]
defineProps(['columns', 'rows'])
</script>

<template>
  <table class="solve_stats w-100">
    <thead v-if="columns.length > 0">
      <tr>
        <th></th>
        <th v-for="column in columns" :key="column" class="text-end fw-normal opacity-75">{{ column }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.label">
        <td :title="row.hint">{{ row.label }}</td>
        <td v-for="(cell, i) in row.cells" :key="i" class="text-end">{{ cell }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.solve_stats {
  font-variant-numeric: tabular-nums;
}
.solve_stats th, .solve_stats td {
  padding: 0 0 0 0.75rem;
}
.solve_stats th:first-child, .solve_stats td:first-child {
  padding-left: 0;
}
</style>
