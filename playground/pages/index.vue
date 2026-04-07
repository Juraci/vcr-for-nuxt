<template>
  <div>
    <h1>vcr-for-nuxt playground</h1>

    <h2>REST</h2>
    <pre v-if="restData" data-test-rest-data>{{ restData }}</pre>
    <button @click="loadRest">Fetch REST</button>

    <h2>GraphQL</h2>
    <pre v-if="graphqlData" data-test-graphql-data>{{ graphqlData }}</pre>
    <button @click="loadGraphql('BR')">Fetch GraphQL with BR variable</button>
    <button @click="loadGraphql('US')">Fetch GraphQL with US variable</button>

    <h2>SSR GraphQL</h2>
    <pre v-if="ssrGraphqlData" data-test-ssr-graphql-data>{{ ssrGraphqlData }}</pre>
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

async function loadGraphql(code: string) {
  const res = await fetch('https://countries.trevorblades.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operationName: 'getCountryQuery',
      query: `query getCountryQuery($code: ID!) {
  country(code: $code) {
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
      variables: { code },
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
      query: `query getCountryQuerySsr($code: ID!) {
  country(code: $code) {
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
      variables: { code: 'BR' },
    }),
  }).then((r) => r.json()),
);
</script>
