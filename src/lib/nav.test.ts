import { describe, expect, it } from "vitest";
import { advanceStep, formatDistance, instruction, maneuverIcon, type NavStep } from "./nav";

const step = (p: Partial<NavStep>): NavStep => ({ type: "turn", name: "", location: [75, 26], distanceM: 100, ...p });

describe("instruction", () => {
  it("turn with road name", () => expect(instruction(step({ modifier: "left", name: "MG Road" }))).toBe("Turn left onto MG Road"));
  it("roundabout exit", () => expect(instruction(step({ type: "roundabout", exit: 2, name: "NH48" }))).toBe("At the roundabout, take exit 2 onto NH48"));
  it("arrive", () => expect(instruction(step({ type: "arrive" }))).toBe("Arrive at the destination"));
  it("icon for slight right", () => expect(maneuverIcon(step({ modifier: "slight right" }))).toBe("turn_slight_right"));
});

describe("formatDistance", () => {
  it("meters rounded to 10", () => expect(formatDistance(247)).toBe("250 m"));
  it("km with one decimal under 10 km", () => expect(formatDistance(1234)).toBe("1.2 km"));
});

describe("advanceStep", () => {
  it("skips maneuvers already reached", () => {
    const steps = [step({ type: "depart", location: [75, 26] }), step({ location: [75.0001, 26] }), step({ location: [75.01, 26] })];
    expect(advanceStep(steps, 1, [75.0001, 26])).toBe(2);
  });
});
