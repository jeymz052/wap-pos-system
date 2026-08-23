export type BranchOption = {
  id: string;
  name: string;
  is_main?: boolean;
  is_active?: boolean;
};

export async function fetchBranchOptions(token: string) {
  const response = await fetch("/api/branch-options", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as { branches?: BranchOption[]; error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load branch options.");
  }

  return payload?.branches ?? [];
}
