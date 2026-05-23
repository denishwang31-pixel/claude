import { trpc } from "../../lib/trpc";

export function useAuth() {
  const { data: user, isLoading } = trpc.budget.me.useQuery();

  return {
    user: user ?? null,
    isLoading,
    isLoggedIn: !!user,
  };
}
