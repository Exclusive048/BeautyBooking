import { describe, expect, it } from "vitest";
import { parseVkCommunityRef, vkCommunityChatUrl } from "@/lib/vk/community-ref";

describe("parseVkCommunityRef — сообщество из NEXT_PUBLIC_VK_COMMUNITY_URL", () => {
  it("короткое имя сообщества", () => {
    expect(parseVkCommunityRef("https://vk.com/masterryadom")).toEqual({ kind: "screen", screenName: "masterryadom" });
    expect(parseVkCommunityRef("https://vk.ru/MasterRyadom/")).toEqual({ kind: "screen", screenName: "masterryadom" });
    expect(parseVkCommunityRef("vk.com/master_ryadom?w=wall")).toEqual({ kind: "screen", screenName: "master_ryadom" });
    expect(parseVkCommunityRef("https://m.vk.com/masterryadom#top")).toEqual({ kind: "screen", screenName: "masterryadom" });
  });

  it("числовой адрес club/public/event даёт ID без обращения к VK", () => {
    expect(parseVkCommunityRef("https://vk.com/club123456")).toEqual({ kind: "id", groupId: 123456 });
    expect(parseVkCommunityRef("https://vk.com/public42")).toEqual({ kind: "id", groupId: 42 });
    expect(parseVkCommunityRef("https://vk.ru/event7")).toEqual({ kind: "id", groupId: 7 });
  });

  it("не-VK ссылки и пустые значения — не сообщество", () => {
    expect(parseVkCommunityRef(undefined)).toBeNull();
    expect(parseVkCommunityRef("")).toBeNull();
    expect(parseVkCommunityRef("   ")).toBeNull();
    expect(parseVkCommunityRef("https://vk.com/")).toBeNull();
    expect(parseVkCommunityRef("https://evil.example/masterryadom")).toBeNull();
    expect(parseVkCommunityRef("https://vk.com.evil.example/masterryadom")).toBeNull();
    expect(parseVkCommunityRef("https://vk.com/%3Cscript%3E")).toBeNull();
  });

  it("ссылка на чат — vk.me с коротким именем", () => {
    expect(vkCommunityChatUrl("masterryadom")).toBe("https://vk.me/masterryadom");
    expect(vkCommunityChatUrl("club123")).toBe("https://vk.me/club123");
  });
});
