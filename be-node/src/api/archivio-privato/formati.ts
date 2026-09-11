/*
 * Il riconoscimento dei formati sta nel worker (`worker/ingestion/
 * riconoscimento.ts`) dall'11/09/2026: lo usano anche le letture che
 * aprono un'email o uno zip per riconoscere quello che c'è dentro, e il
 * worker non importa dall'API. Le rotte continuano a prenderlo da qui.
 */
export * from '../../worker/ingestion/riconoscimento.js';
