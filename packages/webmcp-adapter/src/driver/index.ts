import { chromium } from "playwright-core";

export interface WebMCPHandle {
  readonly browserName: string;
}

export function attachWebMCP(): WebMCPHandle {
  return { browserName: chromium.name() };
}
