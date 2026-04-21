import { getCookie, getHeader } from "h3";
export const EPISODE_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
function datePart() {
  const now = /* @__PURE__ */ new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}
function take(candidate) {
  if (!candidate) return null;
  return EPISODE_NAME_REGEX.test(candidate) ? candidate : null;
}
export function resolveEpisodeName(event) {
  if (event) {
    const fromCookie = take(getCookie(event, "vcr-episode"));
    if (fromCookie) return fromCookie;
    const fromHeader = take(getHeader(event, "x-vcr-episode"));
    if (fromHeader) return fromHeader;
  }
  const fromEnv = take(process.env.VCR_EPISODE);
  if (fromEnv) return fromEnv;
  return datePart();
}
