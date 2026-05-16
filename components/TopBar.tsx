"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, MapPin, Search, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resolveCurrentUserInfo } from "@/lib/current-user";

interface TopBarProps {
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
}

export default function TopBar({ title, subtitle, searchPlaceholder = "Search..." }: TopBarProps) {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState({
    username: "User",
    displayName: "User",
    role: "User",
    initials: "U",
  });
  const [branchName, setBranchName] = useState("Main Branch");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUserInfo = async (authUser: { id: string; email?: string } | null | undefined) => {
      if (!authUser) {
        if (isMounted) {
          setUserInfo({
            username: "User",
            displayName: "User",
            role: "User",
            initials: "U",
          });
          setBranchName("Main Branch");
        }
        return;
      }

      const profileResult = await supabase
        .from("users")
        .select("id, first_name, last_name, username, email, role_id, branch_id")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      const profileUser = profileResult.data as {
        id?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        username?: string | null;
        email?: string | null;
        role_id?: string | null;
        branch_id?: string | null;
      } | null;

      const roleName = profileUser?.role_id
        ? await supabase.from("roles").select("name").eq("id", profileUser.role_id).maybeSingle()
        : { data: null };

      const resolvedUser = resolveCurrentUserInfo({
        authUser,
        profileUser,
        roleName: (roleName.data as { name?: string | null } | null)?.name ?? null,
      });

      if (isMounted) {
        let resolvedBranchName = "Main Branch";

        if (profileUser?.branch_id) {
          const branchResult = await supabase.from("branches").select("name").eq("id", profileUser.branch_id).maybeSingle();
          resolvedBranchName = (branchResult.data as { name?: string | null } | null)?.name?.trim() || resolvedBranchName;
        } else {
          const mainBranchResult = await supabase
            .from("branches")
            .select("name, is_main")
            .eq("is_active", true)
            .order("is_main", { ascending: false })
            .order("name", { ascending: true })
            .limit(1)
            .maybeSingle();

          resolvedBranchName = (mainBranchResult.data as { name?: string | null } | null)?.name?.trim() || resolvedBranchName;
        }

        setUserInfo({
          username: resolvedUser.username,
          displayName: resolvedUser.displayName,
          role: resolvedUser.role,
          initials: resolvedUser.initials,
        });
        setBranchName(resolvedBranchName);
      }
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      void loadUserInfo(session?.user);
    });

    void supabase.auth.getUser().then(({ data }) => loadUserInfo(data.user));

    return () => {
      isMounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }

    return undefined;
  }, [isMenuOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsMenuOpen(false);
    router.replace("/");
    router.refresh();
  };

  return (
    <header className="topbar">
      <div className="topbar__left">
        <h1 className="topbar__title">{title}</h1>
        {subtitle ? <p className="topbar__subtitle">{subtitle}</p> : null}
      </div>

      <div className="topbar__right">
        <button className="topbar__branch" type="button">
          <MapPin size={13} />
          <span>{branchName}</span>
          <ChevronDown size={13} />
        </button>

        <button className="topbar__search" type="button">
          <Search size={15} />
          <span>{searchPlaceholder}</span>
        </button>

        <button className="topbar__notif" type="button" aria-label="Notifications">
          <Bell size={17} />
          <span className="topbar__badge">3</span>
        </button>

        <div className="topbar__user-wrapper" ref={menuRef}>
          <button
            type="button"
            className="topbar__user"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <div className="topbar__avatar">{userInfo.initials}</div>
            <div className="topbar__user-copy">
              <span className="topbar__user-name">{userInfo.username}</span>
            </div>
            <ChevronDown size={13} className={`topbar__chevron ${isMenuOpen ? "topbar__chevron--open" : ""}`} />
          </button>

          {isMenuOpen ? (
            <div className="topbar__menu" role="menu">
              <div className="topbar__menu-header">
                <div className="topbar__menu-avatar">{userInfo.initials}</div>
                <div className="topbar__menu-info">
                  <div className="topbar__menu-username">{userInfo.username}</div>
                  <div className="topbar__menu-role">{userInfo.role}</div>
                </div>
              </div>

              <div className="topbar__menu-divider" />

              <button type="button" className="topbar__menu-item" onClick={() => setIsMenuOpen(false)}>
                <Settings size={16} />
                <span>Profile Settings</span>
              </button>

              <button type="button" className="topbar__menu-item topbar__menu-item--danger" onClick={handleLogout}>
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
