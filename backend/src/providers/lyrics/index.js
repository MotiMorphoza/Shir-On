import { ZemereshetProvider } from './zemereshet.js';
import { ShironetProvider } from './shironet.js';
import { LrclibProvider } from './lrclib.js';
import { LyricsOvhProvider } from './lyricsovh.js';
import { NliProvider } from './nli.js';
import { Tab4uProvider } from './tab4u.js';
import { GoogleSitesLyricsProvider } from './googleSitesLyrics.js';
import { MusixmatchProvider } from './musixmatch.js';
import { LetrasProvider } from './letras.js';

const GLOBAL_PROVIDERS = [
  {
    instance: new LrclibProvider(),
    active: true,
  },
  {
    instance: new MusixmatchProvider(),
    active: true,
  },
  {
    instance: new LetrasProvider(),
    active: true,
  },
  {
    instance: new LyricsOvhProvider(),
    active: true,
  },
];

const HEBREW_PROVIDERS = [
  {
    instance: new Tab4uProvider(),
    active: true,
  },
  {
    instance: new ZemereshetProvider(),
    active: true,
  },
  {
    instance: new GoogleSitesLyricsProvider(),
    active: true,
  },
  {
    instance: new ShironetProvider(),
    active: false,
    reason: 'inactive_http_403',
  },
  {
    instance: new NliProvider(),
    active: false,
    reason: 'inactive_http_403',
  },
];

const CONFIDENCE_THRESHOLD = 0.5;

function isHebrewText(value = '') {
  return /[\u0590-\u05FF]/.test(String(value || ''));
}

function nowMs() {
  return Date.now();
}

function durationMs(startedAt) {
  return Math.max(0, nowMs() - startedAt);
}

function getProvidersForQuery(title, artist) {
  const hebrewQuery = isHebrewText(title) || isHebrewText(artist);
  const providers = hebrewQuery
    ? [...HEBREW_PROVIDERS, ...GLOBAL_PROVIDERS]
    : [...GLOBAL_PROVIDERS];

  return providers
    .filter((entry) => entry.active)
    .map((entry) => entry.instance);
}

export async function fetchLyricsWithReport(title, artist) {
  let best = null;
  const attempts = [];
  const providers = getProvidersForQuery(title, artist);
  const providerPlan = providers.map((provider) => provider.name);
  const startedAt = nowMs();

  for (const [index, provider] of providers.entries()) {
    const attemptStartedAt = nowMs();

    try {
      console.log(
        `[lyrics] trying provider=${provider.name} title="${title}" artist="${artist}"`
      );

      const result = await provider.fetch(title, artist);
      const attemptDuration = durationMs(attemptStartedAt);

      if (!result) {
        attempts.push({
          provider: provider.name,
          status: 'no_result',
          provider_order: index + 1,
          duration_ms: attemptDuration,
        });
        console.log(
          `[lyrics] provider=${provider.name} no result duration_ms=${attemptDuration}`
        );
        continue;
      }

      attempts.push({
        provider: provider.name,
        status: 'ok',
        provider_order: index + 1,
        duration_ms: attemptDuration,
        confidence_score: result.confidence_score,
        source: result.source || provider.name,
      });

      console.log(
        `[lyrics] provider=${provider.name} confidence=${result.confidence_score} duration_ms=${attemptDuration}`
      );

      if (result.confidence_score >= CONFIDENCE_THRESHOLD) {
        return {
          result,
          attempts,
          providerPlan,
          duration_ms: durationMs(startedAt),
        };
      }

      if (!best || result.confidence_score > best.confidence_score) {
        best = result;
      }
    } catch (err) {
      const message = err?.message || 'Unknown provider error';
      const attemptDuration = durationMs(attemptStartedAt);

      attempts.push({
        provider: provider?.name || 'unknown',
        status: 'error',
        provider_order: index + 1,
        duration_ms: attemptDuration,
        error: message,
      });

      console.error(
        `[lyrics] provider=${provider?.name || 'unknown'} failed:`,
        message
      );
    }
  }

  return {
    result: best,
    attempts,
    providerPlan,
    duration_ms: durationMs(startedAt),
  };
}

export async function fetchLyrics(title, artist) {
  const { result } = await fetchLyricsWithReport(title, artist);
  return result;
}
