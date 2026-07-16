import { describe, it, expect } from "vitest";
import { scryptSync } from "crypto";
import { hashPassword, verifyPassword, isValidEmail } from "./password";
import { crossedThresholds } from "../db";

describe("비밀번호 해싱", () => {
  it("라운드트립: 맞으면 true, 틀리면 false", async () => {
    const h = await hashPassword("myS3cret!!");
    expect(await verifyPassword("myS3cret!!", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("null/소셜계정(해시없음)은 false", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", undefined)).toBe(false);
  });

  it("구버전 scryptSync 해시도 호환 검증", async () => {
    const salt = "abc123";
    const legacy = `scrypt$${salt}$${scryptSync("myPass123", salt, 64).toString("hex")}`;
    expect(await verifyPassword("myPass123", legacy)).toBe(true);
  });

  it("이메일 형식 검증", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });
});

describe("예산 임계치 판정", () => {
  it("달성률별 넘긴 임계치", () => {
    expect(crossedThresholds(45)).toEqual([]);
    expect(crossedThresholds(80)).toEqual([50, 80]);
    expect(crossedThresholds(95)).toEqual([50, 80, 90]);
    expect(crossedThresholds(105)).toEqual([50, 80, 90, 100]);
  });
});
