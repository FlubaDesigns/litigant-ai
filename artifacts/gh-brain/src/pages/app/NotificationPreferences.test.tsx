import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock("@/pages/app/session/ConfigPanel", () => ({ ConfigPanel: "div" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/services/sessionService", () => ({ exportAccountData: vi.fn(), deleteAccount: vi.fn() }));
vi.mock("@/services/firestoreService", () => ({ getUserProfile: vi.fn(), updateUserProfile: vi.fn(), updateSessionCompleteNotification: vi.fn(), USER_ROLE_LABELS: {} }));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/components/ui/label", () => ({ Label: "label" }));
vi.mock("@/components/ui/switch", () => ({ Switch: "switch" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useState, useEffect } from "react";
import { getUserProfile, updateUserProfile, updateSessionCompleteNotification } from "@/services/firestoreService";
import { toast } from "sonner";
import { NotificationsTab } from "./Settings";

let state: any[], index: number, effects: Array<() => any>;
const user = { uid: "test-user", email: "test@example.invalid" } as any;
function nodes(node: any): any[] {
  if (!node?.props) return [];
  return [node, ...[node.props.children].flat().flatMap(nodes)];
}
function render() { index = 0; effects = []; return NotificationsTab({ user }); }
function save(tree: any) { return nodes(tree).find(node => node.props.onClick?.name === "handleSave"); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  state = []; index = 0; effects = [];
  vi.mocked(useState).mockImplementation(((initial: any) => {
    const slot = index++;
    if (!(slot in state)) state[slot] = initial;
    return [state[slot], (next: any) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
  }) as any);
  vi.mocked(useEffect).mockImplementation(effect => { effects.push(effect); });
  vi.mocked(updateSessionCompleteNotification).mockResolvedValue();
});
afterEach(() => { vi.useRealTimers(); });

describe("delivered notification preferences", () => {
  it.each([true, false])("renders only the live preference and preserves unavailable saved values (%s)", async enabled => {
    const profile = { notifications: { sessionComplete: enabled, weeklyDigest: true, productUpdates: false } } as any;
    vi.mocked(getUserProfile).mockResolvedValue(profile);
    let tree = render();
    expect(save(tree).props.disabled).toBe(true);
    effects.forEach(effect => effect());
    await Promise.resolve();
    tree = render();
    const switches = nodes(tree).filter(node => node.type === "switch");
    expect(switches).toHaveLength(1);
    expect(switches[0].props.checked).toBe(enabled);
    expect(nodes(tree).some(node => node.props.children === "Weekly digest and product updates")).toBe(true);
    expect(JSON.stringify(tree)).toContain("These emails are not available yet.");
    switches[0].props.onCheckedChange(!enabled);
    await save(render()).props.onClick();
    expect(updateSessionCompleteNotification).toHaveBeenCalledWith("test-user", !enabled);
    expect(updateUserProfile).not.toHaveBeenCalled();
    expect(profile.notifications).toEqual({ sessionComplete: enabled, weeklyDigest: true, productUpdates: false });
  });

  it("loads legacy opt-out without enabling completion emails", async () => {
    vi.mocked(getUserProfile).mockResolvedValue({ notifySessionComplete: false } as any);
    render(); effects.forEach(effect => effect()); await Promise.resolve();
    expect(nodes(render()).find(node => node.type === "switch").props.checked).toBe(false);
  });

  it("blocks saving before preferences load and exposes load errors", async () => {
    vi.mocked(getUserProfile).mockRejectedValue(new Error("offline"));
    const initial = render();
    await save(initial).props.onClick();
    expect(updateSessionCompleteNotification).not.toHaveBeenCalled();
    effects.forEach(effect => effect()); await Promise.resolve(); await Promise.resolve();
    const tree = render();
    expect(save(tree).props.disabled).toBe(true);
    expect(nodes(tree).some(node => node.props.role === "alert")).toBe(true);
  });

  it("does not claim a failed save succeeded", async () => {
    state = [false, false, false, true, false, 0];
    vi.mocked(updateSessionCompleteNotification).mockRejectedValue(new Error("offline"));
    await save(render()).props.onClick();
    expect(toast.error).toHaveBeenCalledWith("Failed to save preferences.");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
