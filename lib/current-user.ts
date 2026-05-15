type MetadataRecord = Record<string, unknown> | null | undefined;

type AuthUserLike = {
  email?: string | null;
  user_metadata?: MetadataRecord;
  app_metadata?: MetadataRecord;
} | null;

type ProfileUserLike = {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  role_id?: string | null;
} | null;

function pickString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }

  return "";
}

function pickMetadataString(metadata: MetadataRecord, ...keys: string[]) {
  if (!metadata) return "";

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function formatRoleLabel(role: string) {
  return role
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getProfileFullName(profileUser?: ProfileUserLike) {
  const firstName = profileUser?.first_name?.trim() ?? "";
  const lastName = profileUser?.last_name?.trim() ?? "";
  return [firstName, lastName].filter(Boolean).join(" ");
}

export function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

export function resolveCurrentUserInfo({
  authUser,
  profileUser,
  roleName,
}: {
  authUser: AuthUserLike;
  profileUser?: ProfileUserLike;
  roleName?: string | null;
}) {
  const authUsername = pickMetadataString(authUser?.user_metadata, "username", "user_name", "handle", "display_name");
  const authFullName = pickMetadataString(authUser?.user_metadata, "full_name", "name", "display_name");
  const authRole =
    pickMetadataString(authUser?.user_metadata, "role", "role_name", "user_role") ||
    pickMetadataString(authUser?.app_metadata, "role", "role_name", "user_role");
  const profileFullName = getProfileFullName(profileUser);
  const email = pickString(profileUser?.email, authUser?.email, "-");

  const username = pickString(
    profileUser?.username,
    authUsername,
    profileFullName,
    authFullName,
    authUser?.email?.split("@")[0],
    "User"
  );

  const displayName = pickString(profileFullName, authFullName, username);
  const role = formatRoleLabel(pickString(roleName, authRole, "User"));

  return {
    username,
    displayName,
    role,
    email,
    initials: getInitials(username || displayName || email),
  };
}