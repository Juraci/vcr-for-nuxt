export function resolveEpisodeName() {
  if (process.env.VCR_EPISODE) return process.env.VCR_EPISODE;
  const now = /* @__PURE__ */ new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}
