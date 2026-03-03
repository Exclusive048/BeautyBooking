const findFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientCard: {
      findFirst,
    },
  },
}));

import { buildClientKey, findCardByKey, parseClientKey } from "@/lib/crm/client-key";

describe("crm/client-key", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("builds key from client user id", () => {
    const result = buildClientKey({ clientUserId: "user-1", clientPhone: "+79991234567" });
    expect(result).toEqual({ type: "user", value: "user-1", key: "user:user-1" });
  });

  it("builds key from normalized russian phone", () => {
    const result = buildClientKey({ clientPhone: "8 (999) 123-45-67" });
    expect(result).toEqual({ type: "phone", value: "+79991234567", key: "phone:+79991234567" });
  });

  it("parses user and phone keys", () => {
    expect(parseClientKey("user:abc")).toEqual({ type: "user", value: "abc", key: "user:abc" });
    expect(parseClientKey("phone:89991234567")).toEqual({
      type: "phone",
      value: "+79991234567",
      key: "phone:+79991234567",
    });
    expect(parseClientKey("bad")).toBeNull();
  });

  it("finds card by user key", async () => {
    findFirst.mockResolvedValueOnce({ id: "card-1" });
    const result = await findCardByKey("provider-1", "user:user-1");
    expect(result).toEqual({ id: "card-1" });
    expect(findFirst).toHaveBeenCalledWith({
      where: { providerId: "provider-1", clientUserId: "user-1" },
      include: { photos: { include: { mediaAsset: true } } },
    });
  });

  it("finds card by phone key", async () => {
    findFirst.mockResolvedValueOnce({ id: "card-2" });
    const result = await findCardByKey("provider-1", "phone:+79991234567");
    expect(result).toEqual({ id: "card-2" });
    expect(findFirst).toHaveBeenCalledWith({
      where: { providerId: "provider-1", clientPhone: "+79991234567" },
      include: { photos: { include: { mediaAsset: true } } },
    });
  });
});
