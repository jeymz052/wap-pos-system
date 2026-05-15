"use client";

import { useEffect, useState } from "react";
import { Bell, ChevronDown, Search, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resolveCurrentUserInfo } from "@/lib/current-user";

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const [userInfo, setUserInfo] = useState({
    username: "User",
    role: "User",
    initials: "U",
  });

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

  return (
    <header className="topbar">
      <div className="topbar__left">
        <h1 className="topbar__title">{title}</h1>
        {subtitle && <p className="topbar__subtitle">{subtitle}</p>}
      </div>

      <div className="topbar__right">
        <button className="topbar__branch">
          <MapPin size={13} />
          <span>Main Branch</span>
          <ChevronDown size={13} />
        </button>

        <button className="topbar__search">
          <Search size={15} />
          <span>Search...</span>
        </button>

        <button className="topbar__notif">
          <Bell size={17} />
          <span className="topbar__badge">4</span>
        </button>

        <button className="topbar__user">
          <div className="topbar__avatar">{userInfo.initials}</div>
          <div className="topbar__user-info">
            <span className="topbar__user-name">{userInfo.username}</span>
            <span className="topbar__user-role">{userInfo.role}</span>
          </div>
          <ChevronDown size={13} />
        </button>
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

        .topbar__user {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 10px 5px 5px;
          background: #f5f7fa;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          cursor: pointer;
          transition: background 0.15s;
          color: #0b1f3a;
        }

        .topbar__user:hover {
          background: #e8edf5;
        }

        .topbar__avatar {
          width: 30px;
          height: 30px;
          background: linear-gradient(135deg, #1e88e5, #0b1f3a);
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          font-family: "Geist", sans-serif;
          flex-shrink: 0;
        }

        .topbar__user-info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .topbar__user-name {
          font-size: 12.5px;
          font-weight: 600;
          color: #0b1f3a;
          font-family: "Geist", sans-serif;
          line-height: 1.2;
        }

        .topbar__user-role {
          font-size: 10px;
          color: #1e88e5;
          font-family: "Geist", sans-serif;
          font-weight: 500;
        }
      `}</style>
    </header>
  );
}
