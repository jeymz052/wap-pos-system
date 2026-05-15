"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, MapPin, Search, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resolveCurrentUserInfo } from "@/lib/current-user";

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState({
    username: "User",
    role: "User",
    initials: "U",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUserInfo = async (authUser: { id: string; email?: string } | null | undefined) => {
      if (!authUser) {
        if (isMounted) {
          setUserInfo({
            username: "User",
            role: "User",
            initials: "U",
          });
        }
        return;
      }

      const profileResult = await supabase
        .from("users")
        .select("id, first_name, last_name, username, email, role_id")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      const profileUser = profileResult.data as {
        first_name?: string | null;
        last_name?: string | null;
        username?: string | null;
        email?: string | null;
        role_id?: string | null;
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
        setUserInfo({
          username: resolvedUser.username,
          role: resolvedUser.role,
          initials: resolvedUser.initials,
        });
      }
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      void loadUserInfo(session?.user);
    });

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
    router.push("/login");
  };

  return (
    <header className="topbar">
      <div className="topbar__left">
        <h1 className="topbar__title">{title}</h1>
        {subtitle && <p className="topbar__subtitle">{subtitle}</p>}
      </div>

      <div className="topbar__right">
        <button className="topbar__branch" type="button">
          <MapPin size={13} />
          <span>Main Branch</span>
          <ChevronDown size={13} />
        </button>

        <button className="topbar__search" type="button">
          <Search size={15} />
          <span>Search...</span>
        </button>

        <button className="topbar__notif" type="button" aria-label="Notifications">
          <Bell size={17} />
          <span className="topbar__badge">1</span>
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
            <span className="topbar__user-name">{userInfo.username}</span>
            <ChevronDown size={13} className={`topbar__chevron ${isMenuOpen ? "topbar__chevron--open" : ""}`} />
          </button>

          {isMenuOpen && (
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
          )}
        </div>
      </div>

      <style jsx>{`
        .topbar {
          height: 56px;
          background: #fff;
          border-bottom: 1px solid #e8edf3;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          position: sticky;
          top: 0;
          z-index: 50;
          box-shadow: 0 1px 8px rgba(0, 0, 0, 0.06);
        }

        .topbar__title {
          font-size: 17px;
          font-weight: 700;
          color: #0b1f3a;
          font-family: "Geist", sans-serif;
          line-height: 1.2;
        }

        .topbar__subtitle {
          font-size: 11.5px;
          color: #6b7a8d;
          font-family: "Geist", sans-serif;
          margin-top: 1px;
        }

        .topbar__right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .topbar__branch {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          background: #f0f5ff;
          border: 1px solid #dde6f5;
          border-radius: 7px;
          color: #0b1f3a;
          font-size: 12.5px;
          font-family: "Geist", sans-serif;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
        }

        .topbar__branch:hover {
          background: #e0ecff;
        }

        .topbar__search {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 14px;
          background: #f5f7fa;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          color: #9aa3ae;
          font-size: 12.5px;
          font-family: "Geist", sans-serif;
          cursor: pointer;
          min-width: 160px;
          transition: border-color 0.15s;
        }

        .topbar__search:hover {
          border-color: #1e88e5;
        }

        .topbar__notif {
          position: relative;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f7fa;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          color: #4a5568;
          cursor: pointer;
          transition: background 0.15s;
        }

        .topbar__notif:hover {
          background: #e0ecff;
          color: #1e88e5;
        }

        .topbar__badge {
          position: absolute;
          top: -4px;
          right: -4px;
          width: 16px;
          height: 16px;
          background: #ef4444;
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: "Geist", sans-serif;
          border: 2px solid #fff;
        }

        .topbar__user-wrapper {
          position: relative;
        }

        .topbar__user {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px 6px 6px;
          background: #f5f7fa;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          cursor: pointer;
          transition: all 0.15s;
          color: #0b1f3a;
          font-family: "Geist", sans-serif;
        }

        .topbar__user:hover {
          background: #e8edf5;
        }

        .topbar__avatar {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #1e88e5, #0b1f3a);
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }

        .topbar__user-name {
          font-size: 12px;
          font-weight: 600;
          color: #0b1f3a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 80px;
        }

        .topbar__chevron {
          transition: transform 0.2s ease;
          flex-shrink: 0;
        }

        .topbar__chevron--open {
          transform: rotate(180deg);
        }

        .topbar__menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 240px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          z-index: 100;
          overflow: hidden;
          animation: slideDown 0.2s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .topbar__menu-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .topbar__menu-avatar {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #1e88e5, #0b1f3a);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }

        .topbar__menu-info {
          flex: 1;
          min-width: 0;
        }

        .topbar__menu-username {
          font-size: 13px;
          font-weight: 600;
          color: #0b1f3a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .topbar__menu-role {
          font-size: 11px;
          color: #6b7a8d;
          margin-top: 2px;
        }

        .topbar__menu-divider {
          height: 1px;
          background: #e2e8f0;
        }

        .topbar__menu-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: none;
          border: none;
          cursor: pointer;
          color: #0b1f3a;
          font-size: 13px;
          font-weight: 500;
          font-family: "Geist", sans-serif;
          transition: background 0.15s;
          text-align: left;
        }

        .topbar__menu-item:hover {
          background: #f8fafc;
        }

        .topbar__menu-item--danger {
          color: #ef4444;
          border-top: 1px solid #e2e8f0;
          margin-top: 4px;
          padding-top: 12px;
        }

        .topbar__menu-item--danger:hover {
          background: #fff5f5;
        }

        .topbar__menu-item svg {
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .topbar {
            padding: 0 12px 0 60px;
          }

          .topbar__title {
            font-size: 16px;
          }

          .topbar__right {
            gap: 8px;
          }

          .topbar__search,
          .topbar__branch {
            display: none;
          }

          .topbar__user-name {
            display: none;
          }

          .topbar__user {
            padding: 6px;
          }
        }
      `}</style>
    </header>
  );
}