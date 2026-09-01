import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  window.localStorage.clear();
});

describe("ThemeToggle", () => {
  it("toggles the root theme and persists the selection", async () => {
    window.localStorage.setItem("forge-theme", "dark");
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", {
      name: /switch to light theme/i,
    });
    await user.click(toggle);

    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("forge-theme")).toBe("light");
    expect(toggle).toHaveAccessibleName(/switch to dark theme/i);
  });
});
