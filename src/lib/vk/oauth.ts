import { AppError } from "@/lib/api/errors";
import { getVkClientId, getVkClientSecret, getVkRedirectUri } from "@/lib/vk/config";

const VK_AUTHORIZE_URL = "https://oauth.vk.com/authorize";
const VK_TOKEN_URL = "https://oauth.vk.com/access_token";
const VK_USERS_URL = "https://api.vk.com/method/users.get";
const VK_API_VERSION = "5.131";

type VkTokenApiResponse =
  | {
      access_token: string;
      user_id: number;
      expires_in?: number;
      email?: string;
    }
  | {
      error: string;
      error_description?: string;
    };

type VkUsersApiResponse =
  | {
      response: Array<{
        id: number;
        first_name: string;
        last_name: string;
        screen_name?: string;
        photo_200?: string;
        photo_100?: string;
      }>;
    }
  | {
      error: {
        error_code: number;
        error_msg: string;
        request_params?: Array<{ key: string; value: string }>;
      };
    };

export type VkTokenPayload = {
  accessToken: string;
  userId: string;
  email?: string | null;
};

export type VkProfile = {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  avatarUrl: string | null;
};

export function buildVkAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = getVkClientId();
  if (!clientId) {
    throw new AppError("VK client id is not configured", 500, "VK_CLIENT_ID_MISSING");
  }

  const url = new URL(VK_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeVkCodeForToken(code: string, redirectUri: string): Promise<VkTokenPayload> {
  const clientId = getVkClientId();
  const clientSecret = getVkClientSecret();
  if (!clientId) {
    throw new AppError("VK client id is not configured", 500, "VK_CLIENT_ID_MISSING");
  }
  if (!clientSecret) {
    throw new AppError("VK client secret is not configured", 500, "VK_CLIENT_SECRET_MISSING");
  }

  const url = new URL(VK_TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => null)) as VkTokenApiResponse | null;
  if (!res.ok || !json) {
    throw new AppError("VK token request failed", 502, "VK_OAUTH_FAILED");
  }

  if ("error" in json) {
    throw new AppError(json.error_description ?? "VK token request failed", 400, "VK_OAUTH_FAILED", json);
  }

  if (!json.access_token || !json.user_id) {
    throw new AppError("VK token response is incomplete", 502, "VK_OAUTH_FAILED", json);
  }

  return {
    accessToken: json.access_token,
    userId: String(json.user_id),
    email: json.email ?? null,
  };
}

export async function fetchVkProfile(accessToken: string, userId?: string): Promise<VkProfile> {
  const url = new URL(VK_USERS_URL);
  if (userId) {
    url.searchParams.set("user_ids", userId);
  }
  url.searchParams.set("fields", "screen_name,photo_200,photo_100");
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("v", VK_API_VERSION);

  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => null)) as VkUsersApiResponse | null;
  if (!res.ok || !json) {
    throw new AppError("VK profile request failed", 502, "VK_PROFILE_FAILED");
  }

  if ("error" in json) {
    throw new AppError(json.error.error_msg || "VK profile request failed", 502, "VK_PROFILE_FAILED", json.error);
  }

  const user = json.response?.[0];
  if (!user) {
    throw new AppError("VK profile is missing", 502, "VK_PROFILE_FAILED");
  }

  return {
    id: String(user.id),
    firstName: user.first_name ?? "",
    lastName: user.last_name ?? "",
    username: user.screen_name ?? null,
    avatarUrl: user.photo_200 ?? user.photo_100 ?? null,
  };
}

export function requireVkRedirectUri(): string {
  const redirectUri = getVkRedirectUri();
  if (!redirectUri) {
    throw new AppError("VK redirect uri is not configured", 500, "VK_REDIRECT_URI_MISSING");
  }
  return redirectUri;
}
