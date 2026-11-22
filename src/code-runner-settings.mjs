// Copyright © 2026 Christopher Snow.
export const idleChoices=[5,15,30,60];
export const defaultIdleMinutes=30;
export const idlePreference='cuda-python-lab:code-runner-idle-minutes';
export const introPreference='cuda-python-lab:code-runner-intro:3';
export function idleMinutes(value) {
  const minutes=Number(value);
  return idleChoices.includes(minutes)?minutes:defaultIdleMinutes;
}
export const wasmSize=bytes=>bytes==null?'Unavailable':`${(bytes/1048576).toFixed(1)} MiB`;
export const elapsedTime=ms=>ms==null?'No completed run':`${(ms/1000).toFixed(1)} s`;
