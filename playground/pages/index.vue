<template>
  <div>
    <h1>vcr-for-nuxt playground</h1>
    <pre>{{ data }}</pre>
    <button @click="load">Fetch</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const data = ref<unknown>(null);

async function load() {
  const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
  data.value = await res.json();
}
</script>
