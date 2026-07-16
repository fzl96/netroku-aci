import { describe, expect, test } from "bun:test";
import { isValidElement } from "react";
import { docsLayoutOptions } from "./layout-options";

describe("docsLayoutOptions", () => {
  test("configures docs navigation and initially opens top-level folders", () => {
    expect(docsLayoutOptions.nav?.url).toBe("/");
    expect(docsLayoutOptions.links?.[0]).toMatchObject({
      type: "main",
      text: "Dashboard",
      url: "/dashboard",
    });
    expect(docsLayoutOptions.sidebar?.defaultOpenLevel).toBe(1);
  });

  test("replaces the stock theme switch with a custom sidebar footer", () => {
    expect(docsLayoutOptions.themeSwitch?.enabled).toBe(false);
    expect(isValidElement(docsLayoutOptions.sidebar?.footer)).toBe(true);
  });
});
