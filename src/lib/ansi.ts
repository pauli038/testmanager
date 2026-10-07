// Playwright error messages carry terminal color codes (ESC[31m…, sometimes
// with the ESC character already lost). Strips them for display.
export const stripAnsi = (s: string) => s.replace(/\u001b?\[\d+(?:;\d+)*m/g, "");
