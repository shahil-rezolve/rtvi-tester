import { describe, expect, it } from "vitest";
import { createReconciler } from "./reconcile";

describe("createReconciler", () => {
  it("re-applies when the desired value changed while an apply was in flight", async () => {
    let desired = true;
    const applied: boolean[] = [];
    let release!: () => void;
    const run = createReconciler(
      () => desired,
      (v) => {
        applied.push(v);
        return applied.length === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve();
      },
    );
    const first = run();
    desired = false;
    void run(); // ignored: already in flight
    release();
    await first;
    expect(applied).toEqual([true, false]);
  });

  it("does nothing extra when the value is stable", async () => {
    const applied: number[] = [];
    await createReconciler(() => 1, async (v) => void applied.push(v))();
    expect(applied).toEqual([1]);
  });
});
