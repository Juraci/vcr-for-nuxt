<template>
  <div>
    <h1>vcr-for-nuxt playground</h1>

    <h2>REST</h2>
    <pre>{{ restData }}</pre>
    <button @click="loadRest">Fetch REST</button>

    <h2>GraphQL</h2>
    <pre>{{ graphqlData }}</pre>
    <button @click="loadGraphql">Fetch GraphQL</button>

    <h2>SSR GraphQL</h2>
    <pre>{{ ssrGraphqlData }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const restData = ref<unknown>(null);
const graphqlData = ref<unknown>(null);

async function loadRest() {
  const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
  restData.value = await res.json();
}

async function loadGraphql() {
  const res = await fetch('https://countries.trevorblades.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operationName: 'getCountryQuery',
      query: `query getCountryQuery {
  country(code: "BR") {
    name
    native
    capital
    emoji
    currency
    languages {
      code
      name
    }
  }
}`,
    }),
  });
  graphqlData.value = await res.json();
}

const { data: ssrGraphqlData } = await useAsyncData('ssr-graphql', () =>
  fetch('https://countries.trevorblades.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operationName: 'getCountryQuerySsr',
      query: `query getCountryQuerySsr {
  country(code: "BR") {
    name
    native
    capital
    emoji
    currency
    languages {
      code
      name
    }
  }
}`,
    }),
  }).then((r) => r.json()),
);
</script>
