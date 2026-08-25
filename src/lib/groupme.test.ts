import { describe, it, expect } from "vitest";

import { isGroupMeUrl } from "./groupme";

describe("isGroupMeUrl", () => {
  it("accepts a share link", () => {
    expect(isGroupMeUrl("https://groupme.com/join_group/12345678/AbCdEfGh")).toBe(
      true,
    );
  });

  it("accepts a subdomain like web.groupme.com", () => {
    expect(isGroupMeUrl("https://web.groupme.com/join_group/1/x")).toBe(true);
  });

  it("tolerates a trailing slash and a query string", () => {
    expect(isGroupMeUrl("https://groupme.com/join_group/1/x/")).toBe(true);
    expect(isGroupMeUrl("https://groupme.com/join_group/1/x?utm=share")).toBe(
      true,
    );
  });

  it("rejects plain http", () => {
    expect(isGroupMeUrl("http://groupme.com/join_group/1/x")).toBe(false);
  });

  it("rejects other hosts", () => {
    expect(isGroupMeUrl("https://example.com/join_group/1/x")).toBe(false);
  });

  it("rejects a host merely ending in the string groupme.com", () => {
    expect(isGroupMeUrl("https://evilgroupme.com/join_group/1/x")).toBe(false);
  });

  it("rejects a userinfo trick that only looks like groupme.com", () => {
    expect(isGroupMeUrl("https://groupme.com@evil.example/join_group/1/x")).toBe(
      false,
    );
  });

  // The whole point of checking the path: this is the web client's address
  // bar, the likeliest wrong thing an owner pastes, and it joins nothing.
  it("rejects a groupme.com page that is not a join link", () => {
    expect(isGroupMeUrl("https://web.groupme.com/chats")).toBe(false);
    expect(isGroupMeUrl("https://groupme.com/")).toBe(false);
    expect(isGroupMeUrl("https://groupme.com/join_group")).toBe(false);
    expect(isGroupMeUrl("https://groupme.com/join_group/")).toBe(false);
  });

  it("rejects things that are not URLs at all", () => {
    expect(isGroupMeUrl("our team chat")).toBe(false);
    expect(isGroupMeUrl("")).toBe(false);
  });
});
