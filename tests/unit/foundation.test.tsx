import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";
import LoginPage from "@/app/(auth)/login/page";

describe("foundation pages", () => {
  it("offers a sign-in link for active demo accounts", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("A clearer week.");
    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn).toHaveAttribute("href", "/login");
    expect(signIn).toHaveAccessibleDescription(/active local demo account/);
  });

  it("identifies schedule examples and planned benefits as illustrative", () => {
    render(<HomePage />);
    expect(screen.getByRole("figure")).toHaveAccessibleName(/synthetic example/);
    expect(screen.getByText(/No live schedule or reservations/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "What we’re working toward" })).toBeVisible();
  });

  it("collects labelled credentials without a role selector", () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Sign in to SlotWise" })).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(container.querySelector("select")).toBeNull();
  });
});
